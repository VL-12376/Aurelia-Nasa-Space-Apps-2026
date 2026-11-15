import { h } from "../core/dom";
import { imageDetailsUrl, loadRealImage } from "../data/nasaImages";

/**
 * A figure with the first NASA Image Library picture for a search. It stays empty (and takes no space)
 * until a picture arrives, and stays empty if NASA cannot be reached.
 */
export function realImageFigure(query: string): HTMLElement {
  const fig = h("figure", { class: "real-img", hidden: true });
  void loadRealImage(query).then((img) => {
    if (!img) return;
    fig.replaceChildren(
      h("img", { src: img.url, alt: img.alt, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }),
      h(
        "figcaption",
        { class: "muted small" },
        `${img.title}. Image: NASA${img.creator ? ` (${img.creator})` : ""}. `,
        h("a", { href: imageDetailsUrl(img.nasaId), target: "_blank", rel: "noopener noreferrer" }, "NASA Image and Video Library"),
      ),
    );
    fig.hidden = false;
  });
  return fig;
}
