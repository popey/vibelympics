# Utility Functions

SDK utility functions for logging, module imports, and internal functionality. These utilities provide debugging helpers, service context management, and internal mechanisms used by the boto3 framework itself.

## Capabilities

### Logging Configuration

Functions for configuring boto3 logging to help with debugging and monitoring AWS API calls.

```python { .api }
def set_stream_logger(name: str = 'boto3', level: int = logging.DEBUG,
                     format_string: str = None) -> None:
    """
    Add a stream handler for the given name and level to the logging module.
    
    By default, this logs all boto3 messages to stdout. This is useful for
    debugging AWS API interactions and understanding what requests are being made.
    
    Parameters:
    - name: Logger name (default: 'boto3'). Use '' to log everything including botocore
    - level: Logging level (e.g., logging.INFO, logging.DEBUG)
    - format_string: Custom log message format string
    
    Warning:
    When logging anything from 'botocore', the full wire trace will appear
    in your logs. If your payloads contain sensitive data, this should not
    be used in production.
    """
```

### Service Context Management

Classes for managing service-wide information and metadata used internally by boto3's resource system.

```python { .api }
from boto3.utils import ServiceContext, LazyLoadedWaiterModel

class ServiceContext:
    """
    Container for service-wide, read-only information about an AWS service.
    
    This class holds metadata and models needed for resource creation and
    provides context about the service being used.
    """
    
    def __init__(self, service_name: str, service_model, 
                 service_waiter_model, resource_json_definitions: Dict[str, Any]):
        """
        Parameters:
        - service_name: Name of the AWS service
        - service_model: Botocore service model for the service
        - service_waiter_model: Waiter model for the service
        - resource_json_definitions: JSON definitions for service resources
        """
        self.service_name = service_name
        self.service_model = service_model
        self.service_waiter_model = service_waiter_model
        self.resource_json_definitions = resource_json_definitions

class LazyLoadedWaiterModel:
    """
    A lazily loaded waiter model for AWS services.
    
    This class defers loading of waiter models until they are actually needed,
    which improves startup performance and reduces memory usage when waiters
    are not used.
    """
    
    def __init__(self, bc_session, service_name: str, api_version: str):
        """
        Parameters:
        - bc_session: Botocore session instance
        - service_name: AWS service name
        - api_version: API version for the service
        """
        self._session = bc_session
        self._service_name = service_name
        self._api_version = api_version
    
    def get_waiter(self, waiter_name: str):
        """
        Get a specific waiter by name.
        
        Parameters:
        - waiter_name: Name of the waiter to retrieve
        
        Returns:
        Botocore waiter instance
        """
```

### Module and Function Utilities

Internal utility functions for dynamic module importing and lazy function loading.

```python { .api }
from boto3.utils import import_module, lazy_call, inject_attribute

def import_module(name: str):
    """
    Import a module by its string name.
    
    This function provides a simple way to import modules dynamically
    at runtime, which is used internally by boto3 for loading service-specific
    functionality.
    
    Parameters:
    - name: Full module name (e.g., 'boto3.s3.transfer')
    
    Returns:
    The imported module object
    
    Note:
    Does not support relative imports.
    """

def lazy_call(full_name: str, **kwargs) -> Callable:
    """
    Create a lazy-loaded function call.
    
    Returns a function that will import the specified module and call
    the specified function only when the returned function is actually called.
    This is used internally for performance optimization.
    
    Parameters:
    - full_name: Full function name including module (e.g., 'module.function')
    - **kwargs: Additional keyword arguments to pass to the function
    
    Returns:
    Function that will perform the lazy import and call when invoked
    """

def inject_attribute(class_attributes: Dict[str, Any], name: str, value: Any) -> None:
    """
    Inject an attribute into a class dictionary.
    
    Used internally by boto3 to dynamically add methods and attributes
    to service classes during resource creation.
    
    Parameters:
    - class_attributes: Class attribute dictionary (typically cls.__dict__)
    - name: Attribute name to inject
    - value: Attribute value to inject
    
    Raises:
    RuntimeError: If the attribute already exists in the class
    """
```

### Compatibility Functions

Functions for handling compatibility issues and platform-specific behavior.

```python { .api }
from boto3.compat import filter_python_deprecation_warnings, rename_file, is_append_mode

def filter_python_deprecation_warnings() -> None:
    """
    Filter Python deprecation warnings from boto3.
    
    This function configures the warning system to suppress deprecation
    warnings related to Python versions that boto3 will stop supporting.
    """

def rename_file(current_filename: str, new_filename: str) -> None:
    """
    Cross-platform file rename operation.
    
    Provides a consistent interface for renaming files across different
    operating systems, handling platform-specific edge cases.
    
    Parameters:
    - current_filename: Current file path
    - new_filename: New file path
    """

def is_append_mode(fileobj) -> bool:
    """
    Check if a file object is opened in append mode.
    
    Used internally to determine how to handle file objects passed
    to various boto3 operations.
    
    Parameters:
    - fileobj: File-like object to check
    
    Returns:
    True if the file object is in append mode, False otherwise
    """
```

### Error Compatibility

Compatibility constants for handling different types of socket and network errors across Python versions.

```python { .api }
from boto3.compat import SOCKET_ERROR

SOCKET_ERROR = ConnectionError  # Standard socket error type for network issues
```

## Usage Examples

### Basic Logging Setup

```python
import boto3
import logging

# Enable basic boto3 logging
boto3.set_stream_logger('boto3', logging.INFO)

# Create a client - you'll now see log messages
s3_client = boto3.client('s3')
s3_client.list_buckets()  # This will log the API call
```

### Detailed Debug Logging

```python
import boto3
import logging

# Enable detailed debug logging (includes wire traces)
boto3.set_stream_logger('', logging.DEBUG)  # Empty string logs everything

# Custom format for log messages
boto3.set_stream_logger(
    'boto3.resources',
    logging.INFO,
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Now all AWS operations will show detailed debugging information
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('my-table')
table.scan()  # This will show extensive debug information
```

### Selective Logging

```python
import boto3
import logging

# Log only specific components
boto3.set_stream_logger('boto3.s3', logging.DEBUG)      # S3 operations only
boto3.set_stream_logger('boto3.dynamodb', logging.INFO) # DynamoDB at info level

# Regular boto3 usage
s3 = boto3.client('s3')        # Will show debug logs
dynamodb = boto3.client('dynamodb')  # Will show info logs
ec2 = boto3.client('ec2')      # No extra logging
```

### Working with Service Context (Advanced)

```python
import boto3
from boto3.utils import ServiceContext

# This is typically used internally, but can be accessed if needed
session = boto3.Session()
dynamodb_resource = session.resource('dynamodb')

# Access the service context (for advanced use cases)
service_context = dynamodb_resource.meta.service_model
print(f"Service name: {service_context.service_name}")
print(f"API version: {service_context.api_version}")
```

### Dynamic Module Loading (Advanced)

```python
from boto3.utils import import_module

# Dynamically import modules at runtime
try:
    s3_module = import_module('boto3.s3.transfer')
    transfer_config = s3_module.TransferConfig()
    print("S3 transfer module loaded successfully")
except ImportError as e:
    print(f"Failed to load module: {e}")
```

### Handling Platform Compatibility

```python
from boto3.compat import rename_file, is_append_mode

# Cross-platform file operations
try:
    rename_file('old-name.txt', 'new-name.txt')
    print("File renamed successfully")
except OSError as e:
    print(f"Failed to rename file: {e}")

# Check file mode before operations
with open('data.txt', 'a') as f:
    if is_append_mode(f):
        print("File is in append mode")
        f.write("Additional data\n")
```

### Custom Logging for Production

```python
import boto3
import logging
import sys

# Production-friendly logging setup
def setup_aws_logging():
    """Set up AWS logging for production use."""
    
    # Create custom formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create handler for AWS logs
    aws_handler = logging.StreamHandler(sys.stdout)
    aws_handler.setFormatter(formatter)
    aws_handler.setLevel(logging.WARNING)  # Only warnings and errors
    
    # Configure boto3 logger
    boto3_logger = logging.getLogger('boto3')
    boto3_logger.addHandler(aws_handler)
    boto3_logger.setLevel(logging.WARNING)
    
    # Prevent duplicate logs
    boto3_logger.propagate = False

# Use in production
setup_aws_logging()

# Now only warnings and errors will be logged
s3_client = boto3.client('s3')
try:
    s3_client.head_bucket(Bucket='nonexistent-bucket')
except Exception as e:
    # This error will be logged
    print(f"Error: {e}")
```

### Debugging Network Issues

```python
import boto3
import logging
from boto3.compat import SOCKET_ERROR

# Enable comprehensive logging for network debugging
boto3.set_stream_logger('botocore', logging.DEBUG)

s3_client = boto3.client('s3')

try:
    response = s3_client.list_buckets()
except SOCKET_ERROR as e:
    print(f"Network error occurred: {e}")
except Exception as e:
    print(f"Other error: {e}")
```