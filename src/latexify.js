import sketch from "sketch";
import Mustache from "mustache";

import fs from "@skpm/fs";
import child_process from "@skpm/child_process";
import os from "@skpm/os";
import Settings from "sketch/settings";

// documentation: https://developer.sketchapp.com/reference/api/

const compileLatex = (document, width, height, templateFileName, preamble) => {
  // TODO not hard coded
  const texTemplateFile =
    "/Users/jb/Documents/PhD/latexit/sketch-assets/template.tex";

  // TODO async
  const latexTemplate = fs.readFileSync(texTemplateFile, "utf8");

  const view = { width, height, document, preamble };
  const latexContent = Mustache.render(latexTemplate, view);

  const tmpDirectory = os.tmpdir();

  const latexFile = `${tmpDirectory}/content.tex`;
  // write tex file to directory
  fs.writeFileSync(latexFile, latexContent);

  // TODO error handling
  // create pdf
  child_process.execSync(
    `pdflatex -output-directory ${tmpDirectory} ${latexFile}`
  );

  // transform pdf into svg
  child_process.execSync(
    `pdf2svg ${tmpDirectory}/content.pdf ${tmpDirectory}/content.svg`
  );

  // read svg file
  const svgContent = fs.readFileSync(`${tmpDirectory}/content.svg`, "utf8");

  return svgContent;
};

const deleteLayer = layer => {
  layer.parent.layers = layer.parent.layers.filter(l => l.id !== layer.id);
};

export default function(context) {
  const doc = sketch.getSelectedDocument();
  const selectedLayers = doc.selectedLayers;
  const selectedCount = selectedLayers.length;

  if (selectedCount > 1) {
    sketch.UI.message("Please select only one TextField to LaTeXify.");
    return;
  }

  if (selectedCount === 0) {
    sketch.UI.message("Please select a TextField to LaTeXify.");
    return;
  }

  // if a TextField => LaTeXify
  const layer = selectedLayers.layers[0];
  if (layer.type === "Text") {
    const {
      text,
      frame: { x, y, width, height }
    } = layer;

    const templateFile = String(
      context.plugin.urlForResourceNamed("template.tex")
    );

    sketch.UI.message("Compiling LaTeX...");
    const svgContent = compileLatex(text, width, height, templateFile, null);

    // create layer
    const group = sketch.createLayerFromData(svgContent, "svg");

    const newLayer = new sketch.Group({
      parent: layer.parent,
      layers: group.layers,
      name: layer.name
    }).adjustToFit();

    newLayer.frame.x = x;
    newLayer.frame.y = y;

    // Save parameters for text reconstruction if needed
    Settings.setLayerSettingForKey(newLayer, "latex-content", text);
    Settings.setLayerSettingForKey(newLayer, "latex-font-size", 10); // TODO
    Settings.setLayerSettingForKey(newLayer, "latex-x", x);
    Settings.setLayerSettingForKey(newLayer, "latex-y", y);
    Settings.setLayerSettingForKey(newLayer, "latex-width", width);
    Settings.setLayerSettingForKey(newLayer, "latex-height", height);

    // delete layer
    deleteLayer(layer);

    sketch.UI.message("LaTeXify done.");
  }

  // if a SVG group, try to get original text and replace with TextField
  else {
    // check if layer has a setting `latex-content`
    const text = Settings.layerSettingForKey(layer, "latex-content");
    if (!text) {
      sketch.UI.message("Select a TextField or a LaTeXField.");
      return;
    }

    const x = Settings.layerSettingForKey(layer, "latex-x", x);
    const y = Settings.layerSettingForKey(layer, "latex-y", y);
    const width = Settings.layerSettingForKey(layer, "latex-width", width);
    const height = Settings.layerSettingForKey(layer, "latex-height", height);

    // replace the layer by a text field containing the latex-content
    new sketch.Text({
      parent: layer.parent,
      name: layer.name,
      text,
      frame: new sketch.Rectangle(x, y, width, height),
      fixedWidth: true
    });

    deleteLayer(layer);

    sketch.UI.message("Layer deTeXified.");
  }
}
