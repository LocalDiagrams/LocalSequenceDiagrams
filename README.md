# LocalSequenceDiagrams
Sequence Diagrams rendered as SVG using a PlantUML-like syntax.  Unlike WebSequenceDiagrams the diagrams are rendered locally completely within the browser.

# Why Local?
By using the `standalone.html` from your file system or a local HTTP server, all sensitive information can be kept internal to your local trusted resources.  Open the DevTools Network tab to see that no data is ever sent to a server (NOTE: "data:image/svg+xml,..." images are never sent to a server).

# Why Simple?
By thoughtfully designing the code to be simple and free of external dependencies, it becomes straight-forward to validate whether the code can be trusted.  In a project with less than 1k lines of code that security analysis can be done relatively quickly.  By contrast, most modern JavaScript projects have dozens (if not hundreds) of dependencies that are pulled in by other dependencies.  Validating even part of a large graph of dependencies is impractical, particularly when many of those projects have frequent updates and are referenced with inexact versions.  This often leads to a practice of assuming that projects are safe until proven otherwise.  While not always possible, reducing complexity has a number of clear advantages.

# Why not WebSequenceDiagrams.com?
Many organizations have a finite list of services that they allow their employees to use.  Ancillary tools are often ignored despite being a concern for possible confidential or security information leak.  A simple tool like LocalSequenceDiagrams that can be run locally and be fully analyzed in a short period of time has a better case for security-minded organizations.

# Why not PlantUML?
As with any self-hosted service, one must allocate resources for a VM, install Java and PlantUML, and maintain security patches for the host OS, Java, and the service.  Plus in non-trvial network environments it can require approvals to assign and maintain a DNS name for the resource.  Alternatively, the "Pure Javascript" version of PlantUML is painfully slow and runs a full Java VM in the browser, which in theory needs to have patches maintained.  The only "platform" that LocalSequenceDiagrams depends on is the browser.
