import sketch from "sketch";
import Mustache from "mustache";

import fs from "@skpm/fs";
import child_process from "@skpm/child_process";
import os from "@skpm/os";
import Settings from "sketch/settings";

// documentation: https://developer.sketchapp.com/reference/api/

const execPromise = command =>
  new Promise((resolve, reject) => {
    child_process.exec(command, (error, stdout, stderr) => {
      console.log(`callback ${command} ${error} ${stdout} ${stderr}`);
      if (error) {
        console.log(`Error running command "${command}"`);
        reject(error, stdout, stderr);
      } else {
        resolve(stdout);
      }
    });
  });

const compileLatex = (
  texTemplateFile,
  document,
  width,
  height,
  fontSize,
  preamble
) => {
  const tmpDirectory = os.tmpdir();
  const latexFile = `${tmpDirectory}/content.tex`;

  const latexTemplate = fs.readFileSync(texTemplateFile, "utf8");

  const view = {
    width,
    height,
    document,
    preamble,
    fontSize,
    skipFontSize: Math.round(fontSize * 1.2)
  };
  const latexContent = Mustache.render(latexTemplate, view);

  // write tex file to directory
  fs.writeFileSync(latexFile, latexContent);

  // compile latex file
  const promiseSVGContent = execPromise(
    `pdflatex -halt-on-error -output-directory ${tmpDirectory} ${latexFile}`
  )
    // transform to SVG
    .then(() =>
      execPromise(
        `pdf2svg ${tmpDirectory}/content.pdf ${tmpDirectory}/content.svg`
      )
    )
    // read the svg content
    .then(() => fs.readFileSync(`${tmpDirectory}/content.svg`, "utf8"));

  return promiseSVGContent;
};

const deleteLayer = layer => {
  layer.parent.layers = layer.parent.layers.filter(l => l.id !== layer.id);
};

const getTemplateFileName = () => {
  const resourcePath = String(
    context.plugin.urlForResourceNamed("template.tex")
  );
  return resourcePath.startsWith("file://")
    ? resourcePath.slice(7)
    : resourcePath;
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
      frame: { x, y, width, height },
      style: { fontSize }
    } = layer;

    const updatePageWithSVG = svgContent => {
      // create layer
      const group = sketch.createLayerFromData(svgContent, "svg");

      const newLayer = new sketch.Group({
        parent: layer.parent,
        layers: group.layers,
        name: layer.name,
        locked: true
      }).adjustToFit();

      newLayer.frame.x = x;
      newLayer.frame.y = y;

      // Save parameters for text reconstruction if needed
      Settings.setLayerSettingForKey(newLayer, "latex-content", text);
      Settings.setLayerSettingForKey(newLayer, "latex-font-size", fontSize);
      Settings.setLayerSettingForKey(newLayer, "latex-x", x);
      Settings.setLayerSettingForKey(newLayer, "latex-y", y);
      Settings.setLayerSettingForKey(newLayer, "latex-width", width);
      Settings.setLayerSettingForKey(newLayer, "latex-height", height);

      // delete layer
      deleteLayer(layer);

      // select new layer
      doc.selectedLayers = [newLayer];
    };

    sketch.UI.message("Compiling LaTeX...");

    const templateFile = getTemplateFileName();

    compileLatex(templateFile, text, width, height, fontSize, null)
      .then(updatePageWithSVG)
      .then(() => sketch.UI.message("LaTeXify done."))
      .catch(err => {
        sketch.UI.message("An arror occured while compiling LaTeX.");
      });
  }

  // if a SVG group, try to get original text and replace with TextField
  else {
    // check if layer has a setting `latex-content`
    const text = Settings.layerSettingForKey(layer, "latex-content");
    if (!text) {
      sketch.UI.message("Select a TextField or a LaTeXField.");
      return;
    }

    const x = Settings.layerSettingForKey(layer, "latex-x");
    const y = Settings.layerSettingForKey(layer, "latex-y");
    const width = Settings.layerSettingForKey(layer, "latex-width");
    const height = Settings.layerSettingForKey(layer, "latex-height");
    const fontSize = Settings.layerSettingForKey(layer, "latex-font-size");

    // replace the layer by a text field containing the latex-content
    const textLayer = new sketch.Text({
      parent: layer.parent,
      name: layer.name,
      text,
      frame: new sketch.Rectangle(x, y, width, height),
      fixedWidth: true
    });

    textLayer.style.fontSize = fontSize;

    deleteLayer(layer);

    sketch.UI.message("Layer deTeXified.");

    // select new layer
    doc.selectedLayers = [textLayer];
  }
}
