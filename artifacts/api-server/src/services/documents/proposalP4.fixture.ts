import sharp from "sharp";
import { buildProposalDocumentModel } from "./proposal";
import { estimateFixture } from "./fixtures";
import { proposalImageUri } from "../proposalDocument";

/** Visible sample reconstruction. No production data, assets or guessed source IDs. */
export async function compactSampleFixture(withImage = true) {
  const placeholder = async (title: string, from: string, to: string) => proposalImageUri(await sharp(Buffer.from(
    `<svg width="1400" height="900" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1400v900H0z"/><g fill="white" text-anchor="middle" font-family="sans-serif"><text x="700" y="440" font-size="56" font-weight="bold">${title}</text><text x="700" y="510" font-size="28">Sample image</text></g></svg>`
  )).png().toBuffer());
  const photos = await Promise.all([
    placeholder("Belleview Ave frontage", "#99b8c6", "#6b8234"),
    placeholder("Existing turf at the entry", "#a7be9a", "#6b8234"),
    placeholder("Zone 4 valve box", "#b8aaa0", "#5e6b48"),
  ]);
  const estimate = estimateFixture(0);
  estimate.estimateNumber = "EST-2026-0014"; estimate.versionNumber = 1;
  estimate.totalCents = 1953190; estimate.hasPlants = true;
  estimate.companyDocument = { ...estimate.companyDocument, addressLine1: "14847 Madison St", city: "Thornton", state: "CO",
    postalCode: "80602", phone: "(303) 254-6695", email: "info@highplainsprop.com", website: "highplainsprop.com",
    estimateTerms: "Prices are valid for 30 days from the estimate date. Payment is due net 30 after the completion invoice. Sales tax is added where it applies. Changes to the scope are billed as additional work.",
    warrantyText: "Plants carry a 1-year limited warranty from installation. It excludes animal damage and damage caused by the customer. Coverage continues through winter only if winter watering is elected, paid for and access is allowed. Needled evergreens (spruce, pine, fir) planted after October 15 are not covered. One replacement is provided at High Plains' cost; replanting labor is billed. Replacements are not re-warranted." };
  const line = (name: string, quantity: string, unit: string, unitPriceCents: number, lineTotalCents: number, detail: string | null = null) =>
    ({ name, quantity, unit, unitPriceCents, lineTotalCents, detail });
  estimate.sections = [
    { name: "Turf removal & bed prep", subtotalCents: 1666000, lines: [
      line("Sod Removal", "1800", "SF", 45, 81000), line("Xeriscape Conversion (Coloradoscape)", "1800", "SF", 600, 1080000),
      line("Drip Irrigation for Xeriscape", "1800", "SF", 225, 405000), line("Small Fir Bark Mulch", "8", "CU. YD", 12500, 100000)] },
    { name: "Plantings", subtotalCents: 240190, lines: [
      line("Blue Avena Grass", "24", "EA", 2400, 57600, "#1 container"), line("Russian Sage", "12", "EA", 4800, 57600, "#5 container"),
      line("Autumn Blaze Maple", "2", "EA", 59500, 119000, '2" caliper, B&B'), line("Tree Stake Kit", "2", "EA", 2995, 5990)] },
    { name: "Fees", subtotalCents: 47000, lines: [line("Disposal Fee", "1", "FLAT", 32500, 32500), line("Delivery Fee", "1", "FLAT", 14500, 14500)] },
  ];
  const plants = [
    { quantity: "2.00", name: "Autumn Blaze Maple", botanicalName: "Acer × freemanii 'Jeffersred'", size: '2" cal.', typeLabel: "Tree", dataUri: await placeholder("Autumn Blaze Maple", "#bf7621", "#805126") },
    { quantity: "12.00", name: "Russian Sage", botanicalName: "Perovskia atriplicifolia", size: "#5", typeLabel: "Perennial", dataUri: await placeholder("Russian Sage", "#ada0cf", "#526b39") },
    { quantity: "24.00", name: "Blue Avena Grass", botanicalName: "Helictotrichon sempervirens", size: "#1", typeLabel: "Ornamental Grass", dataUri: await placeholder("Blue Avena Grass", "#9bb9c1", "#527075") },
  ];
  return buildProposalDocumentModel({
    title: "Front entry xeriscape conversion", number: "P-0042", documentDate: "2026-11-16",
    customerName: "Cherry Hills Office Park", customerAddress: "5600 S Quebec St\nGreenwood Village, CO 80111",
    workLocation: "5600 S Quebec St, Greenwood Village, CO 80111",
    scopeOfWork: 'Remove approximately 1,800 SF of struggling turf along the Belleview Ave frontage and convert it to a water-wise xeriscape bed.\n\n• Strip existing sod and haul off all debris.\n• Install drip irrigation tied into the existing zone 4 valve.\n• Plant ornamental grasses, Russian sage and two Autumn Blaze maples per the attached plan.\n• Top-dress all new beds with 3" of small fir bark mulch.\n\nWork is scheduled over 3–4 days. Existing sprinkler heads in the converted area will be capped.',
    estimate, coverSource: withImage ? "photo" : "none", hero: withImage ? { caption: "", dataUri: photos[0] } : null,
    visualScope: [], palette: { introText: "", groups: [] }, schedule: [], plants, includePlantPalette: true,
    photoLayout: "large", photos: photos.map((dataUri, order) => ({ dataUri, order, caption: ["Belleview Ave frontage", "Existing turf at the entry", "Zone 4 valve box"][order] })),
  });
}
