# Every Export is supersampled 2× and downsampled

The brief proposed supersampling only small sizes. Instead, both renderers always render at 2× the requested scale and downsample: Lanczos via sharp on the server, the equivalent step in the browser. One code path for all sizes avoids an arbitrary "small" threshold and keeps browser and server output comparable. The pixel-diff test compares the final downsampled images.
