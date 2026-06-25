class PolarConversionError(Exception):
    """Base exception for conversion errors that should be reported to the UI."""


class UnsupportedPolarFileError(PolarConversionError):
    """Raised when a file is recognized but cannot be converted safely."""

