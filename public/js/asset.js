const AssetModule = (() => {

  function createAsset() {
    return { x: 0, y: 0, width: 64, height: 64, rotation: 0 };
  }

  function drawAsset(ctx, asset, img) {
    if (!img || !img.complete) {
      ctx.save();
      ctx.translate(asset.x, asset.y);
      ctx.rotate(asset.rotation);
      ctx.fillStyle = '#00e5a0';
      ctx.fillRect(-asset.width / 2, -asset.height / 2, asset.width, asset.height);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-asset.width / 2, -asset.height / 2, asset.width, asset.height);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(asset.x, asset.y);
    ctx.rotate(asset.rotation);
    ctx.drawImage(img, -asset.width / 2, -asset.height / 2, asset.width, asset.height);
    ctx.restore();
  }

  return { createAsset, drawAsset };
})();
