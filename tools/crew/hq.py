"""Full-quality resize used for every pose: premultiplied alpha + Lanczos, all colours kept."""
import numpy as np
from PIL import Image


def hq_resize(rgba, scale):
    """Full-quality resize: premultiplied alpha + Lanczos, every colour kept (no palette, no outline)."""
    from PIL import Image as _I
    h, w = rgba.shape[:2]
    th, tw = max(1, round(h * scale)), max(1, round(w * scale))
    if (th, tw) == (h, w):
        return rgba.copy()
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    pre = np.concatenate([rgba[..., :3].astype(np.float32) * a, a * 255.0], -1)
    chans = [np.asarray(_I.fromarray(pre[..., i].astype(np.float32), "F").resize((tw, th), _I.LANCZOS)) for i in range(4)]
    out_a = np.clip(chans[3], 0, 255)
    rgb = np.stack(chans[:3], -1) / np.maximum(out_a[..., None] / 255.0, 1e-6)
    out = np.zeros((th, tw, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).round().astype(np.uint8)
    out[..., 3] = np.where(out_a < 10, 0, out_a).round().astype(np.uint8)
    out[out[..., 3] == 0, :3] = 0
    return out
