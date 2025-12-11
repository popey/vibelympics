# S3 Transfer Operations

High-level S3 transfer functionality with automatic multipart handling, progress callbacks, and retry logic. These operations are automatically injected into S3 clients and resources, providing simplified interfaces for common file transfer tasks while handling the complexities of multipart uploads, downloads, and error recovery.

## Capabilities

### Transfer Configuration

Configuration class for customizing S3 transfer behavior, including multipart thresholds, concurrency settings, and bandwidth limits.

```python { .api }
from boto3.s3.transfer import TransferConfig

class TransferConfig:
    """
    Configuration for S3 transfer operations.
    
    Controls multipart upload/download behavior, concurrency, and performance tuning.
    """
    
    def __init__(self, multipart_threshold: int = 8 * 1024 * 1024,
                 max_concurrency: int = 10, multipart_chunksize: int = 8 * 1024 * 1024,
                 num_download_attempts: int = 5, max_io_queue: int = 100,
                 io_chunksize: int = 256 * 1024, use_threads: bool = True,
                 max_bandwidth: int = None):
        """
        Parameters:
        - multipart_threshold: File size threshold for multipart operations (bytes)
        - max_concurrency: Maximum number of concurrent upload/download threads
        - multipart_chunksize: Size of each multipart chunk (bytes)
        - num_download_attempts: Number of download retry attempts
        - max_io_queue: Maximum number of IO operations to queue
        - io_chunksize: Size of each IO chunk (bytes)
        - use_threads: Whether to use threading for transfers
        - max_bandwidth: Maximum bandwidth usage in bytes/second
        """
```

### Client Transfer Methods

These methods are automatically injected into all S3 client instances, providing high-level transfer functionality.

```python { .api }
# Methods available on boto3.client('s3') instances

def upload_file(filename: str, bucket: str, key: str, 
                extra_args: Dict[str, Any] = None, 
                callback: Callable = None, 
                config: TransferConfig = None) -> None:
    """
    Upload a file to S3.
    
    Automatically handles multipart uploads for large files and provides
    progress callbacks and error handling.
    
    Parameters:
    - filename: Path to the local file to upload
    - bucket: S3 bucket name
    - key: S3 object key (path within bucket)
    - extra_args: Additional arguments for the upload (e.g., ContentType, ACL)
    - callback: Progress callback function called with bytes transferred
    - config: TransferConfig for customizing transfer behavior
    """

def download_file(bucket: str, key: str, filename: str,
                  extra_args: Dict[str, Any] = None,
                  callback: Callable = None,
                  config: TransferConfig = None) -> None:
    """
    Download a file from S3.
    
    Automatically handles multipart downloads for large files and provides
    progress callbacks and retry logic.
    
    Parameters:
    - bucket: S3 bucket name
    - key: S3 object key to download
    - filename: Local path where file will be saved
    - extra_args: Additional arguments for the download
    - callback: Progress callback function
    - config: TransferConfig for customizing transfer behavior
    """

def upload_fileobj(fileobj, bucket: str, key: str,
                   extra_args: Dict[str, Any] = None,
                   callback: Callable = None,
                   config: TransferConfig = None) -> None:
    """
    Upload a file-like object to S3.
    
    Accepts any file-like object that supports read() method.
    
    Parameters:
    - fileobj: File-like object to upload (must support read())
    - bucket: S3 bucket name
    - key: S3 object key
    - extra_args: Additional arguments for the upload
    - callback: Progress callback function
    - config: TransferConfig for customizing transfer behavior
    """

def download_fileobj(bucket: str, key: str, fileobj,
                     extra_args: Dict[str, Any] = None,
                     callback: Callable = None,
                     config: TransferConfig = None) -> None:
    """
    Download an S3 object to a file-like object.
    
    Downloads to any file-like object that supports write() method.
    
    Parameters:
    - bucket: S3 bucket name
    - key: S3 object key to download
    - fileobj: File-like object to write to (must support write())
    - extra_args: Additional arguments for the download
    - callback: Progress callback function
    - config: TransferConfig for customizing transfer behavior
    """
```

### Resource Transfer Methods

These methods are automatically injected into S3 resource objects (Bucket and Object instances).

```python { .api }
# Methods available on S3 Bucket resources
class Bucket:
    def upload_file(self, filename: str, key: str,
                    extra_args: Dict[str, Any] = None,
                    callback: Callable = None,
                    config: TransferConfig = None) -> None:
        """Upload a file to this bucket."""
    
    def download_file(self, key: str, filename: str,
                      extra_args: Dict[str, Any] = None,
                      callback: Callable = None,
                      config: TransferConfig = None) -> None:
        """Download a file from this bucket."""
    
    def upload_fileobj(self, fileobj, key: str,
                       extra_args: Dict[str, Any] = None,
                       callback: Callable = None,
                       config: TransferConfig = None) -> None:
        """Upload a file-like object to this bucket."""
    
    def download_fileobj(self, key: str, fileobj,
                         extra_args: Dict[str, Any] = None,
                         callback: Callable = None,
                         config: TransferConfig = None) -> None:
        """Download an object from this bucket to a file-like object."""

# Methods available on S3 Object resources  
class Object:
    def upload_file(self, filename: str,
                    extra_args: Dict[str, Any] = None,
                    callback: Callable = None,
                    config: TransferConfig = None) -> None:
        """Upload a file to this S3 object."""
    
    def download_file(self, filename: str,
                      extra_args: Dict[str, Any] = None,
                      callback: Callable = None,
                      config: TransferConfig = None) -> None:
        """Download this S3 object to a file."""
    
    def upload_fileobj(self, fileobj,
                       extra_args: Dict[str, Any] = None,
                       callback: Callable = None,
                       config: TransferConfig = None) -> None:
        """Upload a file-like object to this S3 object."""
    
    def download_fileobj(self, fileobj,
                         extra_args: Dict[str, Any] = None,
                         callback: Callable = None,
                         config: TransferConfig = None) -> None:
        """Download this S3 object to a file-like object."""
```

### Copy Operations

High-level copy operations for moving objects within S3, with support for cross-region and cross-account copying.

```python { .api }
# Methods available on S3 client, bucket, and object resources

def copy(copy_source: Union[Dict[str, str], str], bucket: str, key: str,
         extra_args: Dict[str, Any] = None, callback: Callable = None,
         source_client = None, config: TransferConfig = None) -> None:
    """
    Copy an S3 object from one location to another.
    
    Supports copying within the same bucket, between buckets, and across regions.
    
    Parameters:
    - copy_source: Source object specification (dict with Bucket/Key or string)
    - bucket: Destination bucket name
    - key: Destination object key
    - extra_args: Additional arguments for the copy operation
    - callback: Progress callback function
    - source_client: S3 client for the source object (for cross-region copies)
    - config: TransferConfig for customizing copy behavior
    """
```

### Transfer Constants

Constants for configuring transfer client behavior.

```python { .api }
from boto3.s3.constants import CLASSIC_TRANSFER_CLIENT, AUTO_RESOLVE_TRANSFER_CLIENT

CLASSIC_TRANSFER_CLIENT = "classic"      # Use classic transfer client
AUTO_RESOLVE_TRANSFER_CLIENT = "auto"    # Automatically resolve best transfer client
```

## Usage Examples

### Basic File Uploads and Downloads

```python
import boto3

s3_client = boto3.client('s3')

# Upload a local file
s3_client.upload_file('local-file.txt', 'my-bucket', 'files/remote-file.txt')

# Download a file
s3_client.download_file('my-bucket', 'files/remote-file.txt', 'downloaded-file.txt')
```

### Using Transfer Configuration

```python
import boto3
from boto3.s3.transfer import TransferConfig

# Configure transfer settings
config = TransferConfig(
    multipart_threshold=1024 * 25,  # 25MB threshold for multipart
    max_concurrency=10,
    multipart_chunksize=1024 * 25,
    use_threads=True
)

s3_client = boto3.client('s3')

# Upload large file with custom configuration
s3_client.upload_file(
    'large-file.zip',
    'my-bucket', 
    'uploads/large-file.zip',
    config=config
)
```

### Progress Callbacks

```python
import boto3
import sys

def upload_progress(bytes_transferred):
    """Progress callback function."""
    sys.stdout.write(f"\rUploaded: {bytes_transferred} bytes")
    sys.stdout.flush()

s3_client = boto3.client('s3')

# Upload with progress callback
s3_client.upload_file(
    'my-file.txt',
    'my-bucket',
    'uploads/my-file.txt',
    callback=upload_progress
)
print()  # New line after progress
```

### Working with File-like Objects

```python
import boto3
from io import BytesIO

s3_client = boto3.client('s3')

# Upload from in-memory buffer
data = b"Hello, World! This is test data."
buffer = BytesIO(data)

s3_client.upload_fileobj(buffer, 'my-bucket', 'text/hello.txt')

# Download to in-memory buffer
download_buffer = BytesIO()
s3_client.download_fileobj('my-bucket', 'text/hello.txt', download_buffer)

# Read the downloaded data
download_buffer.seek(0)
downloaded_data = download_buffer.read()
print(downloaded_data.decode('utf-8'))
```

### Using S3 Resources for Transfers

```python
import boto3

s3_resource = boto3.resource('s3')

# Work with bucket resource
bucket = s3_resource.Bucket('my-bucket')
bucket.upload_file('local-file.txt', 'uploads/file.txt')
bucket.download_file('uploads/file.txt', 'downloaded-file.txt')

# Work with object resource
obj = s3_resource.Object('my-bucket', 'documents/report.pdf')
obj.upload_file('local-report.pdf')
obj.download_file('downloaded-report.pdf')
```

### Copy Operations

```python
import boto3

s3_client = boto3.client('s3')

# Copy within same bucket
copy_source = {'Bucket': 'my-bucket', 'Key': 'old-path/file.txt'}
s3_client.copy(copy_source, 'my-bucket', 'new-path/file.txt')

# Copy between buckets
copy_source = {'Bucket': 'source-bucket', 'Key': 'path/file.txt'}
s3_client.copy(copy_source, 'destination-bucket', 'path/file.txt')

# Copy with additional metadata
s3_client.copy(
    copy_source,
    'destination-bucket',
    'path/file.txt',
    extra_args={
        'MetadataDirective': 'REPLACE',
        'Metadata': {'author': 'John Doe', 'version': '1.0'}
    }
)
```

### Advanced Transfer Configuration

```python
import boto3
from boto3.s3.transfer import TransferConfig

# High-performance configuration for large files
high_perf_config = TransferConfig(
    multipart_threshold=1024 * 1024 * 100,  # 100MB threshold
    max_concurrency=20,                     # 20 concurrent threads
    multipart_chunksize=1024 * 1024 * 100,  # 100MB chunks
    use_threads=True,
    max_bandwidth=1024 * 1024 * 10          # 10 MB/s bandwidth limit
)

# Conservative configuration for limited resources
conservative_config = TransferConfig(
    multipart_threshold=1024 * 1024 * 10,   # 10MB threshold
    max_concurrency=2,                      # Only 2 concurrent threads
    multipart_chunksize=1024 * 1024 * 5,    # 5MB chunks
    use_threads=False                       # No threading
)

s3_client = boto3.client('s3')

# Use appropriate configuration based on file size and system resources
s3_client.upload_file(
    'very-large-file.zip',
    'my-bucket',
    'uploads/large-file.zip',
    config=high_perf_config
)
```

### Error Handling for Transfers

```python
import boto3
from boto3.exceptions import S3UploadFailedError, S3TransferFailedError
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')

try:
    s3_client.upload_file('local-file.txt', 'my-bucket', 'uploads/file.txt')
    print("Upload successful")
    
except S3UploadFailedError as e:
    print(f"S3 upload failed: {e}")
    
except ClientError as e:
    error_code = e.response['Error']['Code']
    if error_code == 'NoSuchBucket':
        print("Bucket does not exist")
    elif error_code == 'AccessDenied':
        print("Access denied - check permissions")
    else:
        print(f"AWS error: {e}")
        
except FileNotFoundError:
    print("Local file not found")
    
except Exception as e:
    print(f"Unexpected error: {e}")
```