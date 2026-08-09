"use client";

import { forwardRef } from "react";
import {
  MockupViewer2D,
  type MockupViewer2DHandle,
  type MockupViewer2DProps,
} from "@/components/modelagem/MockupViewer2D";
import { NonApparelMockupViewer } from "@/components/modelagem/NonApparelMockupViewer";
import type { ModelagemPreview } from "@/lib/modelagem-preview";

export type ProductMockupViewerProps = Omit<
  MockupViewer2DProps,
  "productType" | "baseColorHex"
> & {
  preview: ModelagemPreview;
};

export const ProductMockupViewer = forwardRef<
  MockupViewer2DHandle,
  ProductMockupViewerProps
>(function ProductMockupViewer({ preview, ...rest }, ref) {
  if (preview.kind === "MUG") {
    return (
      <NonApparelMockupViewer
        ref={ref}
        kind="MUG"
        baseColorHex={preview.baseColorHex}
        caption={preview.caption}
        {...rest}
      />
    );
  }

  if (preview.kind === "FLAT" || preview.kind === "AREA") {
    return (
      <NonApparelMockupViewer
        ref={ref}
        kind="FLAT"
        flatAspect={preview.flatAspect ?? 90 / 50}
        baseColorHex={preview.baseColorHex}
        caption={preview.caption}
        {...rest}
      />
    );
  }

  return (
    <MockupViewer2D
      ref={ref}
      productType={preview.productType ?? "T_SHIRT"}
      baseColorHex={preview.baseColorHex}
      caption={preview.caption}
      {...rest}
    />
  );
});
