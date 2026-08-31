# -*- coding: utf-8 -*-
"""把华丽葫芦 logo（图2）的近黑背景替换为图1的宫墙红渐变背景，并做整体协调性优化。"""
import sys
sys.path.insert(0, r'C:\Users\Lenovo\.workbuddy\binaries\python\versions\3.13.12\Lib\site-packages')
import numpy as np
from PIL import Image, ImageFilter
import os

DESIGN = r'E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent\design'
IMG1 = os.path.join(DESIGN, 'App_logo_icon_design__a_styliz_2026-08-28T14-54-38.png')   # 背景参考
IMG2 = os.path.join(DESIGN, 'Luxurious_ornate_Chinese_gourd_2026-08-28T15-01-59.png')  # 华丽葫芦
OUT = os.path.join(DESIGN, 'logo_palace_v3.png')


def border_bg_color(arr):
    """取四周边缘像素的中位数作为背景色"""
    edge = np.concatenate([arr[0, :, :3], arr[-1, :, :3], arr[:, 0, :3], arr[:, -1, :3]], axis=0)
    return np.median(edge, axis=0)


def flood_background(arr, tol=48.0, max_iter=1200):
    """从边缘泛洪填充得到连通背景掩码（numpy 迭代膨胀实现）"""
    bg = border_bg_color(arr)
    h, w, _ = arr.shape
    dist = np.sqrt(((arr[:, :, :3].astype(np.float64) - bg) ** 2).sum(axis=2))
    color_mask = dist < tol
    # 种子：边缘上的颜色匹配像素
    mask = np.zeros((h, w), dtype=bool)
    mask[0, :] = color_mask[0, :]
    mask[-1, :] = color_mask[-1, :]
    mask[:, 0] |= color_mask[:, 0]
    mask[:, -1] |= color_mask[:, -1]
    for _ in range(max_iter):
        grow = mask.copy()
        grow[1:, :] |= mask[:-1, :]
        grow[:-1, :] |= mask[1:, :]
        grow[:, 1:] |= mask[:, :-1]
        grow[:, :-1] |= mask[:, 1:]
        grow &= color_mask
        if grow.sum() == mask.sum():
            break
        mask = grow
    return mask


def main():
    im1 = np.array(Image.open(IMG1).convert('RGB')).astype(np.float64)
    im2 = np.array(Image.open(IMG2).convert('RGB')).astype(np.float64)
    assert im1.shape == im2.shape, '尺寸不一致'
    h, w, _ = im2.shape

    # 1. 图2 背景掩码（近黑背景，葫芦主体为宫墙红+金色，颜色差异大）
    mask2 = flood_background(im2, tol=48.0)
    print('图2 背景像素占比: %.1f%%' % (100.0 * mask2.sum() / (h * w)))

    # 2. 图1 背景掩码与逐行渐变色
    mask1 = flood_background(im1, tol=55.0)
    print('图1 背景像素占比: %.1f%%' % (100.0 * mask1.sum() / (h * w)))
    row_color = np.zeros((h, 3))
    last = None
    for y in range(h):
        row = im1[y][mask1[y]]
        if len(row) >= 50:
            row_color[y] = np.median(row, axis=0)
            last = row_color[y]
        else:
            row_color[y] = last if last is not None else np.median(im1[0][mask1[0]], axis=0)
    # 补齐开头未覆盖的行
    for y in range(h):
        if row_color[y].sum() == 0:
            row_color[y] = row_color[max(y - 1, 0)] if y > 0 else row_color[0]
    # 平滑渐变（滑动平均，窗口 81）
    kernel = np.ones(81) / 81.0
    pad = np.pad(row_color, ((40, 40), (0, 0)), mode='edge')
    smooth = np.stack([np.convolve(pad[:, c], kernel, mode='valid') for c in range(3)], axis=1)
    # 3. 图1 背景有轻微横向暗角：加入列方向的径向暗角（中心亮、四角暗 ~8%）
    xs = np.linspace(-1, 1, w)[None, :]
    ys = np.linspace(-1, 1, h)[:, None]
    r2 = (xs ** 2 + ys ** 2)
    vignette = 1.0 - 0.10 * r2  # 中心 1.0 → 四角 0.8
    bg_new = smooth[:, None, :] * vignette[:, :, None]

    # 4. 替换图2背景（先整体替换，再羽化混合）
    filled = im2.copy()
    filled[mask2] = bg_new[mask2]

    # 羽化：掩码模糊 2px，边界过渡自然
    mask_img = Image.fromarray((mask2 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.0))
    alpha = (np.array(mask_img).astype(np.float64) / 255.0)[:, :, None]
    blended = filled * alpha + im2 * (1 - alpha)

    # 5. 整体协调性：
    #    a) 轻微提升亮度与暖色饱和，让金线在红底上更亮眼
    out = blended.copy()
    out = out * 1.03 + 2.0  # 微提亮
    #    b) 葫芦主体区域（非背景）做轻微对比增强
    keep = 1.0 - alpha[:, :, 0]
    if keep.sum() > 0:
        mean = (out[:, :, 0] * keep).sum() / keep.sum() * 0.299 + \
               (out[:, :, 1] * keep).sum() / keep.sum() * 0.587 + \
               (out[:, :, 2] * keep).sum() / keep.sum() * 0.114
        g = 1.06
        out = (out - mean) * g + mean
    out = np.clip(out, 0, 255).astype(np.uint8)

    Image.fromarray(out).save(OUT)
    print('已保存:', OUT)

    # 6. 顺带导出小尺寸应用图标 512/256
    im = Image.fromarray(out)
    for size in (512, 256):
        im.resize((size, size), Image.LANCZOS).save(os.path.join(DESIGN, 'logo_palace_v3_%d.png' % size))
    print('已导出 512/256 图标')


if __name__ == '__main__':
    main()
