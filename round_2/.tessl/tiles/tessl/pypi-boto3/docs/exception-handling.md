# Exception Handling

Comprehensive exception hierarchy for handling AWS service errors, resource issues, and SDK-specific problems. Boto3 provides structured error handling that helps identify and respond to different failure scenarios in AWS operations.

## Capabilities

### Base Exception

The root exception class for all boto3-specific errors, providing a common base for exception handling patterns.

```python { .api }
class Boto3Error(Exception):
    """
    Base class for all Boto3 errors.
    
    All boto3-specific exceptions inherit from this class, allowing
    for broad exception handling when needed.
    """
```

### Resource Management Exceptions

Exceptions related to AWS resource creation, loading, and API version management.

```python { .api }
class ResourceNotExistsError(Boto3Error):
    """
    Raised when attempting to create a resource that does not exist.
    
    This occurs when trying to create a resource for a service that
    doesn't support the resource interface, only the client interface.
    """
    
    def __init__(self, service_name: str, available_services: List[str], 
                 has_low_level_client: bool):
        """
        Parameters:
        - service_name: The requested service name
        - available_services: List of services that support resources
        - has_low_level_client: Whether a client interface exists for this service
        """

class UnknownAPIVersionError(Boto3Error):
    """
    Raised when an invalid API version is specified for a service.
    
    This occurs when requesting a specific API version that is not
    available for the requested service.
    """
    
    def __init__(self, service_name: str, bad_api_version: str, 
                 available_api_versions: List[str]):
        """
        Parameters:
        - service_name: The service name
        - bad_api_version: The invalid API version requested
        - available_api_versions: List of valid API versions
        """

class ResourceLoadException(Boto3Error):
    """
    General exception for errors that occur during resource loading.
    
    This is raised when there are problems loading or initializing
    AWS service resources.
    """

class NoVersionFound(Boto3Error):
    """
    Raised when no API version can be found for a service.
    
    Note: This exception is deprecated and may be removed in future versions.
    """
```

### Transfer Operation Exceptions

Exceptions specific to S3 transfer operations, including uploads, downloads, and retry scenarios.

```python { .api }
class RetriesExceededError(Boto3Error):
    """
    Raised when the maximum number of retries has been exceeded.
    
    This exception includes information about the last exception
    that caused the retry to fail.
    """
    
    def __init__(self, last_exception: Exception, msg: str = 'Max Retries Exceeded'):
        """
        Parameters:
        - last_exception: The final exception that caused failure
        - msg: Error message describing the retry failure
        """
        self.last_exception = last_exception

class S3TransferFailedError(Boto3Error):
    """
    Raised when an S3 transfer operation fails.
    
    This is a general exception for S3 transfer failures that
    covers both upload and download operations.
    """

class S3UploadFailedError(Boto3Error):
    """
    Raised when an S3 upload operation specifically fails.
    
    This is used for upload-specific failures that may require
    different handling than general transfer failures.
    """
```

### DynamoDB Operation Exceptions

Exceptions specific to DynamoDB operations, particularly around condition expressions and query parameters.

```python { .api }
class DynamoDBOperationNotSupportedError(Boto3Error):
    """
    Raised when an unsupported operation is attempted on a DynamoDB value.
    
    This occurs when trying to use condition operators directly on Python
    values instead of using AttributeBase methods to create ConditionBase objects.
    """
    
    def __init__(self, operation: str, value: Any):
        """
        Parameters:
        - operation: The operation that was attempted (e.g., 'AND', 'OR')
        - value: The value that the operation was attempted on
        """

class DynamoDBNeedsConditionError(Boto3Error):
    """
    Raised when a ConditionBase object is expected but not provided.
    
    This occurs when DynamoDB operations require condition expressions
    but receive incompatible value types instead.
    """
    
    def __init__(self, value: Any):
        """
        Parameters:
        - value: The invalid value that was provided instead of a condition
        """

class DynamoDBNeedsKeyConditionError(Boto3Error):
    """
    Raised when a key condition is required but not provided.
    
    This occurs in DynamoDB query operations that require key conditions
    to specify which items to retrieve.
    """
```

### Warning Classes

Warning classes for deprecated functionality and version compatibility issues.

```python { .api }
class PythonDeprecationWarning(Warning):
    """
    Warning for Python versions scheduled to become unsupported.
    
    This warning is emitted when using boto3 with Python versions
    that will be deprecated in future releases.
    """
```

## Usage Examples

### Basic Exception Handling

```python
import boto3
from boto3.exceptions import Boto3Error, ResourceNotExistsError

try:
    # Try to create a resource for a service that might not support it
    service = boto3.resource('route53')  # Route53 doesn't support resources
except ResourceNotExistsError as e:
    print(f"Resource not available: {e}")
    # Fall back to client interface
    service = boto3.client('route53')
except Boto3Error as e:
    print(f"General boto3 error: {e}")
```

### DynamoDB Exception Handling

```python
import boto3
from boto3.dynamodb.conditions import Key, Attr
from boto3.exceptions import DynamoDBOperationNotSupportedError

try:
    # Correct usage with Key and Attr objects
    condition = Key('pk').eq('value') & Attr('sk').begins_with('prefix')
    
    # This would raise an exception:
    # bad_condition = 'pk' == 'value'  # Can't use string directly
    
except DynamoDBOperationNotSupportedError as e:
    print(f"Invalid DynamoDB operation: {e}")
```

### S3 Transfer Exception Handling

```python
import boto3
from boto3.exceptions import S3UploadFailedError, RetriesExceededError

s3_client = boto3.client('s3')

try:
    s3_client.upload_file('large-file.zip', 'my-bucket', 'uploads/large-file.zip')
except S3UploadFailedError as e:
    print(f"S3 upload failed: {e}")
except RetriesExceededError as e:
    print(f"Upload retries exceeded. Last error: {e.last_exception}")
```

### Service Discovery with Exception Handling

```python
import boto3
from boto3.exceptions import UnknownAPIVersionError

session = boto3.Session()

try:
    # Try to use a specific API version
    dynamodb = session.resource('dynamodb', api_version='2010-01-01')  # Old version
except UnknownAPIVersionError as e:
    print(f"API version not available: {e}")
    # Use the default/latest version instead
    dynamodb = session.resource('dynamodb')
```

### Comprehensive Error Handling Pattern

```python
import boto3
from boto3.exceptions import (
    Boto3Error, ResourceNotExistsError, UnknownAPIVersionError,
    S3TransferFailedError, DynamoDBOperationNotSupportedError
)
from botocore.exceptions import NoCredentialsError, ClientError

def create_aws_service(service_name, use_resource=True):
    """
    Create AWS service with comprehensive error handling.
    """
    try:
        if use_resource:
            return boto3.resource(service_name)
        else:
            return boto3.client(service_name)
            
    except ResourceNotExistsError:
        print(f"Resource interface not available for {service_name}, using client")
        return boto3.client(service_name)
        
    except UnknownAPIVersionError as e:
        print(f"API version issue: {e}")
        return boto3.client(service_name)  # Use default version
        
    except NoCredentialsError:
        print("AWS credentials not found. Please configure credentials.")
        raise
        
    except ClientError as e:
        print(f"AWS service error: {e}")
        raise
        
    except Boto3Error as e:
        print(f"Boto3 error: {e}")
        raise
```