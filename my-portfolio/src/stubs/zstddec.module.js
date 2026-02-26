// Stub for ZSTDDecoder — only needed for ZSTD-supercompressed KTX2 files.
// Basis Universal transcoded textures (ETC1S/UASTC) don't use ZSTD.
export class ZSTDDecoder {
    init() {
        return Promise.resolve()
    }
    decode(array) {
        throw new Error('ZSTDDecoder: ZSTD decompression not available. This KTX2 file uses ZSTD supercompression which requires the full zstddec library.')
    }
}
