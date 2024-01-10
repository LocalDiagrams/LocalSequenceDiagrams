# LocalSequenceDiagrams
Sequence Diagrams rendered as SVG using a PlantUML-like syntax.  Unlike WebSequenceDiagrams the diagrams are rendered locally completely within the browser.

# Why Local?
By using the `standalone.html` from your file system or a local HTTP server, all sensitive information can be kept internal to your local trusted resources.

# Why Simple?
By thoughtfully designing the code to be simple and free of external dependencies, it becomes straight-forward to validate whether the code can be trusted.  In a project with less than 1k lines of code that security analysis can be done relatively quickly.  By contrast, most modern JavaScript projects have dozens (if not hundreds) of dependencies that are pulled in by other dependencies.  Validating even part of a large graph of dependencies is impractical, particularly when many of those projects have frequent updates and are referenced with inexact versions.  This often leads to a practice of assuming that projects are safe until proven otherwise.  While not always possible, reducing complexity has a number of clear advantages.

# Why not WebSequenceDiagrams.com?
Many organizations have a finite list of services that they allow their employees to use.  Ancillary tools are often ignored despite being a concern for possible confidential or security information leak.  A simple tool like LocalSequenceDiagrams that can be run locally and be fully analyzed in a short period of time has a better case for security-minded organizations.
