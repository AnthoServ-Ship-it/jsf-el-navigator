const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const output = path.join(projectRoot, "assets", "demo.gif");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jsf-el-demo-"));

const scenes = [
    {
        tab: "clientes.xhtml",
        hint: "1. Ctrl+clic en la expresión EL",
        lines: [
            ["01", '<h:form id="formulario">'],
            ["02", '  <p:inputText value="#{clienteController.nombre}" />'],
            ["03", "  <p:commandButton"],
            ["04", '      value="Guardar"'],
            ["05", '      actionListener="#{clienteController.guardar()}" />'],
            ["06", "</h:form>"]
        ],
        activeLine: 4,
        activeStart: 28,
        activeWidth: 350
    },
    {
        tab: "ClienteController.java",
        hint: "2. VS Code abre el controlador",
        lines: [
            ["12", "@Named"],
            ["13", "public class ClienteController {"],
            ["14", "  private final ClienteService clienteService;"],
            ["15", ""],
            ["16", "  public void guardar() {"],
            ["17", "      clienteService.guardar(nombre);"],
            ["18", "  }"]
        ],
        activeLine: 4,
        activeStart: 20,
        activeWidth: 120
    },
    {
        tab: "ClienteController.java",
        hint: "3. Ctrl+clic en el servicio inyectado",
        lines: [
            ["14", "  private final ClienteService clienteService;"],
            ["15", ""],
            ["16", "  @Inject"],
            ["17", "  public ClienteController(ClienteService clienteService) {"],
            ["18", "      this.clienteService = clienteService;"],
            ["19", "  }"],
            ["20", ""],
            ["21", "  public void guardar() {"],
            ["22", "      clienteService.guardar(nombre);"],
            ["23", "  }"]
        ],
        activeLine: 8,
        activeStart: 22,
        activeWidth: 260
    },
    {
        tab: "ClienteServiceImpl.java",
        hint: "4. Implementación encontrada",
        lines: [
            ["06", "@ApplicationScoped"],
            ["07", "public class ClienteServiceImpl implements ClienteService {"],
            ["08", ""],
            ["09", "  @Override"],
            ["10", "  public void guardar(String nombre) {"],
            ["11", '      System.out.println("Cliente guardado");'],
            ["12", "  }"],
            ["13", "}"]
        ],
        activeLine: 4,
        activeStart: 20,
        activeWidth: 220
    }
];

try {
    scenes.forEach((scene, index) => {
        const svgPath = path.join(temporary, `${String(index + 1).padStart(2, "0")}.svg`);
        const pngPath = path.join(temporary, `${String(index + 1).padStart(2, "0")}.png`);
        fs.writeFileSync(svgPath, renderScene(scene, index), "utf8");
        run("ffmpeg", ["-loglevel", "error", "-y", "-i", svgPath, "-frames:v", "1", pngPath]);
    });

    const concatPath = path.join(temporary, "frames.txt");
    const concat = scenes
        .map((_, index) => {
            const frame = path.join(temporary, `${String(index + 1).padStart(2, "0")}.png`);
            return `file '${frame}'\nduration ${index === scenes.length - 1 ? "2.2" : "1.6"}`;
        })
        .join("\n");
    const lastFrame = path.join(temporary, `${String(scenes.length).padStart(2, "0")}.png`);
    fs.writeFileSync(concatPath, `${concat}\nfile '${lastFrame}'\n`, "utf8");

    run("ffmpeg", [
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-filter_complex",
        "[0:v]fps=4,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none[out]",
        "-map",
        "[out]",
        "-loop",
        "0",
        output
    ]);
    process.stdout.write(`Demostración generada en ${output}\n`);
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}

function renderScene(scene, activeStage) {
    const lineHeight = 48;
    const codeStart = 184;
    const code = scene.lines
        .map(([number, value], index) => {
            const y = codeStart + index * lineHeight;
            const highlighted = index === scene.activeLine;
            const highlight = highlighted
                ? `<rect x="${288 + scene.activeStart * 11.5}" y="${y - 31}" width="${scene.activeWidth}" height="42" rx="7" fill="#164e63" stroke="#22d3ee" stroke-width="2"/>`
                : "";
            return `${highlight}<text x="255" y="${y}" class="number">${escapeXml(number)}</text><text x="300" y="${y}" class="code">${escapeXml(value)}</text>`;
        })
        .join("");
    const stages = ["XHTML", "Controller", "Service", "Implementation"]
        .map((label, index) => {
            const x = 260 + index * 240;
            const active = index <= activeStage;
            const circle = active ? "#22c55e" : "#475569";
            const text = active ? "#f8fafc" : "#94a3b8";
            const connector =
                index < 3
                    ? `<line x1="${x + 34}" y1="610" x2="${x + 206}" y2="610" stroke="${index < activeStage ? "#22c55e" : "#475569"}" stroke-width="6"/>`
                    : "";
            return `${connector}<circle cx="${x}" cy="610" r="25" fill="${circle}"/><text x="${x}" y="617" text-anchor="middle" class="stageNumber">${index + 1}</text><text x="${x}" y="657" text-anchor="middle" class="stage" fill="${text}">${label}</text>`;
        })
        .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <style>
    .ui { font: 20px 'DejaVu Sans', sans-serif; fill: #cbd5e1; }
    .title { font: 700 22px 'DejaVu Sans', sans-serif; fill: #f8fafc; }
    .hint { font: 700 24px 'DejaVu Sans', sans-serif; fill: #67e8f9; }
    .code { font: 21px 'DejaVu Sans Mono', monospace; fill: #e2e8f0; }
    .number { font: 18px 'DejaVu Sans Mono', monospace; fill: #64748b; }
    .stage { font: 17px 'DejaVu Sans', sans-serif; }
    .stageNumber { font: 700 16px 'DejaVu Sans', sans-serif; fill: #07111f; }
  </style>
  <rect width="1200" height="675" fill="#0f172a"/>
  <rect width="1200" height="58" rx="18" fill="#111827"/>
  <circle cx="28" cy="29" r="8" fill="#ef4444"/>
  <circle cx="54" cy="29" r="8" fill="#f59e0b"/>
  <circle cx="80" cy="29" r="8" fill="#22c55e"/>
  <text x="108" y="37" class="title">JSF EL Navigator · Anthoserv</text>
  <rect x="0" y="58" width="230" height="507" fill="#111827"/>
  <text x="20" y="100" class="ui">EXPLORER</text>
  <text x="20" y="144" class="ui">▾ demo-web</text>
  <text x="38" y="184" class="ui">  clientes.xhtml</text>
  <text x="38" y="224" class="ui">  ClienteController</text>
  <text x="20" y="280" class="ui">▾ demo-service</text>
  <text x="38" y="320" class="ui">  ClienteService</text>
  <text x="38" y="360" class="ui">  ClienteServiceImpl</text>
  <rect x="230" y="58" width="970" height="58" fill="#1e293b"/>
  <rect x="230" y="58" width="360" height="58" fill="#0f172a"/>
  <text x="255" y="95" class="title">${escapeXml(scene.tab)}</text>
  <rect x="230" y="116" width="970" height="449" fill="#0b1220"/>
  ${code}
  <rect x="230" y="510" width="970" height="55" fill="#082f49"/>
  <text x="255" y="546" class="hint">${escapeXml(scene.hint)}</text>
  ${stages}
</svg>`;
}

function escapeXml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function run(command, args) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.status !== 0) {
        throw new Error(`${command} terminó con código ${result.status}`);
    }
}
