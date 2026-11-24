import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dmr5DownloadPanel } from '../Dmr5DownloadPanel';
import type { ParsedCave } from '@shared/types';

describe('Dmr5DownloadPanel', () => {
  const mockCave: ParsedCave = {
    stationLabels: [
      { name: 'Vchod', pos: { x: 0, y: 0, z: 0 }, isEntrance: true, gps: { lat: 48.665276, lon: 20.817054 } },
    ],
    stations: [],
    segments: [],
    scraps: [],
    surfaces: [],
    centerOffset: { x: 0, y: 0, z: 0 },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 50 }, center: { x: 50, y: 50, z: 25 }, size: { x: 100, y: 100, z: 50 } },
    hasSurface: false,
    pointCount: 1,
    stationCount: 1,
    segmentCount: 0,
    scrapCount: 0,
  } as unknown as ParsedCave;

  it('renders with cave entrance GPS coordinates', () => {
    render(
      <Dmr5DownloadPanel
        cave={mockCave}
        lang="sk"
        onDownload={vi.fn()}
        isDownloading={false}
        lastDownloadedDmr={null}
        onSaveFiles={vi.fn()}
      />
    );

    expect(screen.getByText(/DMR 5.0 \(GKÚ LiDAR SR\)/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('48.665276')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20.817054')).toBeInTheDocument();
  });

  it('triggers onDownload with selected coordinates and extent', () => {
    const handleDownload = vi.fn();
    render(
      <Dmr5DownloadPanel
        cave={mockCave}
        lang="sk"
        onDownload={handleDownload}
        isDownloading={false}
        lastDownloadedDmr={null}
        onSaveFiles={vi.fn()}
      />
    );

    // Switch extent to 1000m (1 km)
    const btn1km = screen.getByText('1 km');
    fireEvent.click(btn1km);

    // Click download button
    const downloadBtn = screen.getByText(/Stiahnuť a zobraziť povrch/i);
    fireEvent.click(downloadBtn);

    expect(handleDownload).toHaveBeenCalledTimes(1);
    expect(handleDownload).toHaveBeenCalledWith(48.665276, 20.817054, 1000, 'bpv');
  });

  it('allows stepping extent by 500m and setting custom extent', () => {
    const handleDownload = vi.fn();
    render(
      <Dmr5DownloadPanel
        cave={mockCave}
        lang="sk"
        onDownload={handleDownload}
        isDownloading={false}
        lastDownloadedDmr={null}
        onSaveFiles={vi.fn()}
      />
    );

    // Initial extent is 500m, click +500 m button
    const stepUpBtn = screen.getByText('+500 m');
    fireEvent.click(stepUpBtn); // now 1000m
    fireEvent.click(stepUpBtn); // now 1500m

    expect(screen.getByText(/1.5 km/i)).toBeInTheDocument();

    // Click download button
    const downloadBtn = screen.getByText(/Stiahnuť a zobraziť povrch/i);
    fireEvent.click(downloadBtn);

    expect(handleDownload).toHaveBeenCalledWith(48.665276, 20.817054, 1500, 'bpv');
  });

  it('allows switching to raw ETRS89 ellipsoidal height system', () => {
    const handleDownload = vi.fn();
    render(
      <Dmr5DownloadPanel
        cave={mockCave}
        lang="sk"
        onDownload={handleDownload}
        isDownloading={false}
        lastDownloadedDmr={null}
        onSaveFiles={vi.fn()}
      />
    );

    const etrsBtn = screen.getByText(/ETRS89 \(elipsoid\)/i);
    fireEvent.click(etrsBtn);

    const downloadBtn = screen.getByText(/Stiahnuť a zobraziť povrch/i);
    fireEvent.click(downloadBtn);

    expect(handleDownload).toHaveBeenCalledWith(48.665276, 20.817054, 500, 'etrs89');
  });

  it('displays save button and triggers onSaveFiles when lastDownloadedDmr is present', () => {
    const handleSave = vi.fn();
    render(
      <Dmr5DownloadPanel
        cave={mockCave}
        lang="sk"
        onDownload={vi.fn()}
        isDownloading={false}
        lastDownloadedDmr={{
          tifBuffer: new ArrayBuffer(10),
          tfwText: 'world file',
          filename: 'dmr5_test',
          minZ: 835.4,
          maxZ: 912.0,
          width: 500,
          height: 500,
        }}
        onSaveFiles={handleSave}
      />
    );

    expect(screen.getByText(/835.4 – 912.0 m/i)).toBeInTheDocument();
    const saveBtn = screen.getByText(/Uložiť .tif \+ .tfw do PC/i);
    expect(saveBtn).toBeInTheDocument();

    fireEvent.click(saveBtn);
    expect(handleSave).toHaveBeenCalledTimes(1);
  });
});
