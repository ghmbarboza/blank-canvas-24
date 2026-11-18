import { describe, expect, it } from "vitest";

import { findDownload, googleExportMime, googleQuery, isReadable, parseFileList } from "./drive";

describe("parseFileList", () => {
  it("lê a lista do Google Drive e ignora pasta", () => {
    expect(
      parseFileList({
        data: {
          files: [
            { id: "1", name: "Tabela de preços.pdf", mimeType: "application/pdf" },
            { id: "2", name: "Pasta", mimeType: "application/vnd.google-apps.folder" },
            { id: "3", name: "FAQ", mimeType: "application/vnd.google-apps.document" },
          ],
        },
      }),
    ).toEqual([
      { id: "1", name: "Tabela de preços.pdf", mime: "application/pdf", driveId: null },
      { id: "3", name: "FAQ", mime: "application/vnd.google-apps.document", driveId: null },
    ]);
  });

  it("lê a lista do OneDrive (value, file.mimeType, parentReference)", () => {
    expect(
      parseFileList({
        value: [
          {
            id: "A",
            name: "Contrato.docx",
            file: {
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
            parentReference: { driveId: "d1" },
          },
          { id: "B", name: "Fotos", folder: { childCount: 3 } },
        ],
      }),
    ).toEqual([
      {
        id: "A",
        name: "Contrato.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        driveId: "d1",
      },
    ]);
  });
});

describe("findDownload", () => {
  it("acha o link temporário em qualquer nível", () => {
    expect(
      findDownload({
        data: {
          downloaded_file_content: {
            s3url: "https://s3.x/a.pdf",
            mimetype: "application/pdf",
            name: "a.pdf",
          },
        },
      }),
    ).toEqual({
      url: "https://s3.x/a.pdf",
      mime: "application/pdf",
      name: "a.pdf",
    });
  });
  it("aceita conteúdo em texto quando não há link", () => {
    expect(findDownload({ data: { content: "Perguntas frequentes da clínica…" } })?.text).toContain(
      "Perguntas",
    );
  });
  it("sem nada, devolve null", () => {
    expect(findDownload({ data: {} })).toBeNull();
  });
});

describe("helpers", () => {
  it("formato de exportação dos arquivos nativos do Google", () => {
    expect(googleExportMime("application/vnd.google-apps.spreadsheet")).toBe("text/csv");
    expect(googleExportMime("application/pdf")).toBeNull();
  });
  it("só importa o que dá para ler", () => {
    expect(isReadable({ id: "1", name: "x.pdf", mime: null })).toBe(true);
    expect(isReadable({ id: "1", name: "foto.jpg", mime: "image/jpeg" })).toBe(false);
  });
  it("consulta do Drive escapa aspas e ignora pasta e lixeira", () => {
    expect(googleQuery("preço d'água")).toBe(
      "trashed = false and mimeType != 'application/vnd.google-apps.folder' and name contains 'preço d água'",
    );
  });
});
