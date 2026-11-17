import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImageUploadField } from "@/components/whatsapp/ImageUploadField";
import { imageProblem } from "@/api/media";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <ImageUploadField label="Header image" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </QueryClientProvider>
  );
}

const png = (name = "offer.png", size = 10) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("imageProblem", () => {
  it("accepts JPG and PNG up to 5 MB", () => {
    expect(imageProblem(png())).toBeNull();
    expect(imageProblem(new File([new Uint8Array(1)], "a.jpg", { type: "image/jpeg" }))).toBeNull();
  });
  it("rejects other types and oversize files", () => {
    expect(imageProblem(new File(["x"], "a.gif", { type: "image/gif" }))).toMatch(/JPG or PNG/);
    expect(imageProblem(png("big.png", 5 * 1024 * 1024 + 1))).toMatch(/5 MB/);
  });
});

describe("ImageUploadField", () => {
  it("uploads the chosen file as the raw body and returns the public link", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          url: "https://api.example.com/files/abc",
          filename: "offer.png",
          mimeType: "image/png",
          sizeBytes: 10,
        }),
        { status: 201 },
      ),
    );
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Header image"), { target: { files: [png()] } });

    await waitFor(() =>
      expect(screen.getByTestId("value").textContent).toBe("https://api.example.com/files/abc"),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/media?filename=offer.png");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(File);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect(screen.getByAltText("Selected header")).toBeTruthy();
  });

  it("shows the server's message when the upload fails", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Only JPG and PNG images are supported" }), { status: 400 }),
    );
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Header image"), { target: { files: [png()] } });
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Only JPG and PNG images are supported",
    );
    expect(screen.getByTestId("value").textContent).toBe("");
  });

  it("blocks an unsupported file without calling the API", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Header image"), {
      target: { files: [new File(["x"], "doc.pdf", { type: "application/pdf" })] },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/JPG or PNG/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the user remove the image", () => {
    render(<Harness initial="https://api.example.com/files/abc" />);
    fireEvent.click(screen.getByLabelText("Remove image"));
    expect(screen.getByTestId("value").textContent).toBe("");
  });
});
