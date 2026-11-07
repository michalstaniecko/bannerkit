// A Group Layer on the Canvas (ADR 0007): one `DocumentGroup` holding its children's
// objects, so a click, a drag or a nudge takes the Group as a whole.
//
// Placement: the mapper (mapper.ts) owns it, not Fabric. A DocumentGroup never runs
// Fabric's layout (its LayoutManager does nothing): `applyLayer` sizes it to the
// Group's Box (core `layerExtent`) with an identity transform centred on that Box,
// then places each child through the Group's transform. A drag moves the
// DocumentGroup; the editor bakes the move into the children and applies the Group
// again, so between gestures its transform is always the identity around its Box.
//
// Opacity: like CSS (and the server's `drawGroup`), a Group with opacity < 1 draws
// its children onto one Canvas-sized surface at full opacity and lays that surface
// over the Canvas with the Group's opacity, so overlapping children do not show
// through each other. The surface is pixel-aligned with the target (same size, same
// transform), never resampled, so the browser Export matches the server Render.
// Fabric's own object cache is off: it would resample (and it is skipped anyway when
// a child has a shadow).
//
// Selection: Fabric-`interactive`, so a Layer inside can be the active object (picked by the
// editor's rules, picking.ts) and a Textbox inside enters editing on click.
import { Group, LayoutManager, util, type FabricObject } from 'fabric'

/** Fabric's layout never moves or resizes a DocumentGroup: the mapper places it. */
class PlacedByMapper extends LayoutManager {
  override performLayout() {}
}

export class DocumentGroup extends Group {
  constructor(objects: FabricObject[]) {
    super(objects, { layoutManager: new PlacedByMapper(), objectCaching: false, subTargetCheck: true, interactive: true })
  }

  override render(ctx: CanvasRenderingContext2D) {
    if (this.opacity >= 1 || this.isNotVisible()) return super.render(ctx)
    const surface = util.createCanvasElement()
    surface.width = ctx.canvas.width
    surface.height = ctx.canvas.height
    const drawn = surface.getContext('2d')!
    drawn.setTransform(ctx.getTransform())
    const opacity = this.opacity
    this.opacity = 1
    try {
      super.render(drawn)
    } finally {
      this.opacity = opacity
    }
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha *= opacity
    ctx.drawImage(surface, 0, 0)
    ctx.restore()
  }
}
