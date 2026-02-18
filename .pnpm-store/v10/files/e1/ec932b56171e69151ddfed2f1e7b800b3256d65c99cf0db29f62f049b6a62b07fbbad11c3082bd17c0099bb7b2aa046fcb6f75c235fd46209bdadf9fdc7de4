import { throttle } from "@tldraw/editor";
const hoverLockedEditors = /* @__PURE__ */ new WeakMap();
function getShapeToHover(editor) {
  const hitShape = editor.getShapeAtPoint(editor.inputs.getCurrentPagePoint(), {
    hitInside: false,
    hitLabels: false,
    margin: editor.options.hitTestMargin / editor.getZoomLevel(),
    renderingOnly: true
  });
  if (!hitShape) return null;
  let shapeToHover = void 0;
  const outermostShape = editor.getOutermostSelectableShape(hitShape);
  if (outermostShape === hitShape) {
    shapeToHover = hitShape;
  } else {
    if (outermostShape.id === editor.getFocusedGroupId() || editor.getSelectedShapeIds().includes(outermostShape.id)) {
      shapeToHover = hitShape;
    } else {
      shapeToHover = outermostShape;
    }
  }
  return shapeToHover.id;
}
function _updateHoveredShapeId(editor) {
  const cameraMoving = editor.getCameraState() === "moving";
  if (!cameraMoving) {
    hoverLockedEditors.set(editor, false);
    const nextHoveredId2 = getShapeToHover(editor);
    return editor.setHoveredShape(nextHoveredId2);
  }
  if (hoverLockedEditors.get(editor)) {
    return;
  }
  const currentHoveredId = editor.getHoveredShapeId();
  if (!currentHoveredId) {
    hoverLockedEditors.set(editor, true);
    return;
  }
  const nextHoveredId = getShapeToHover(editor);
  if (nextHoveredId === currentHoveredId) {
    return;
  }
  editor.setHoveredShape(null);
  hoverLockedEditors.set(editor, true);
}
const updateHoveredShapeId = throttle(
  _updateHoveredShapeId,
  process.env.NODE_ENV === "test" ? 0 : 32
);
export {
  updateHoveredShapeId
};
//# sourceMappingURL=updateHoveredShapeId.mjs.map
