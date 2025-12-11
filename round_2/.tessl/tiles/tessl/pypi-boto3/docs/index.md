# Boto3

The AWS SDK for Python, providing both high-level resource-oriented and low-level client-oriented interfaces to AWS services. Boto3 simplifies AWS service integration by handling authentication, request signing, error handling, retries, and pagination automatically, while offering comprehensive coverage of AWS APIs through two programming models: resources for object-oriented workflows and clients for direct service API access.

## Package Information

- **Package Name**: boto3
- **Language**: Python
- **Installation**: `pip install boto3`
- **Dependencies**: Requires `botocore` (automatic dependency)

## Core Imports

```python
import boto3
```

For session-based usage:

```python
from boto3 import Session
```

For exceptions:

```python
from boto3.exceptions import (
    Boto3Error, ResourceNotExistsError, UnknownAPIVersionError,
    S3TransferFailedError, S3UploadFailedError, DynamoDBOperationNotSupportedError,
    DynamoDBNeedsConditionError, DynamoDBNeedsKeyConditionError, RetriesExceededError
)
```

For utility functions:

```python
from boto3 import set_stream_logger
```

For DynamoDB conditions:

```python
from boto3.dynamodb.conditions import Key, Attr
```

## Basic Usage

```python
import boto3

# Create clients using default session (simplest approach)
s3_client = boto3.client('s3')
dynamodb_client = boto3.client('dynamodb')

# Create resources using default session  
s3_resource = boto3.resource('s3')
dynamodb_resource = boto3.resource('dynamodb')

# List S3 buckets
response = s3_client.list_buckets()
for bucket in response['Buckets']:
    print(bucket['Name'])

# Work with S3 bucket resource
bucket = s3_resource.Bucket('my-bucket')
for obj in bucket.objects.all():
    print(obj.key)

# Custom session for specific configuration
session = boto3.Session(
    aws_access_key_id='ACCESS_KEY',
    aws_secret_access_key='SECRET_KEY',
    region_name='us-east-1'
)
ec2 = session.client('ec2')
```

## Architecture

Boto3 provides a layered architecture optimizing for different use cases:

- **Session Layer**: Manages credentials, configuration, and service discovery
- **Client Layer**: Low-level service access with 1:1 mapping to AWS APIs
- **Resource Layer**: Object-oriented abstractions with automatic pagination and waiters
- **Service Extensions**: Specialized functionality (S3 transfer, DynamoDB conditions, EC2 tags)

The session-based design allows both simple default usage and advanced configuration scenarios, while the dual client/resource model accommodates different programming preferences and use cases within the same SDK.

## Capabilities

### Session Management

Core session functionality for managing AWS credentials, regions, and service configuration. Provides both default session convenience and custom session flexibility.

```python { .api }
def client(service_name: str, **kwargs) -> BaseClient: ...
def resource(service_name: str, **kwargs) -> ServiceResource: ...
def setup_default_session(**kwargs) -> None: ...

class Session:
    def __init__(self, aws_access_key_id: str = None, aws_secret_access_key: str = None, 
                 aws_session_token: str = None, region_name: str = None, 
                 botocore_session = None, profile_name: str = None, 
                 aws_account_id: str = None): ...
    def client(self, service_name: str, **kwargs) -> BaseClient: ...
    def resource(self, service_name: str, **kwargs) -> ServiceResource: ...
```

[Session Management](./session-management.md)

### Exception Handling  

Comprehensive exception hierarchy for handling AWS service errors, resource issues, and SDK-specific problems. Includes base exceptions and service-specific error types.

```python { .api }
class Boto3Error(Exception): ...
class ResourceNotExistsError(Boto3Error): ...
class UnknownAPIVersionError(Boto3Error): ...
class S3TransferFailedError(Boto3Error): ...
class S3UploadFailedError(Boto3Error): ...
class DynamoDBOperationNotSupportedError(Boto3Error): ...
class DynamoDBNeedsConditionError(Boto3Error): ...
class DynamoDBNeedsKeyConditionError(Boto3Error): ...
class RetriesExceededError(Boto3Error): ...
```

[Exception Handling](./exception-handling.md)

### DynamoDB Operations

High-level DynamoDB functionality including condition expressions, type serialization, and table operations. Provides pythonic interfaces for DynamoDB's attribute-value model.

```python { .api }
from boto3.dynamodb.conditions import Key, Attr
from boto3.dynamodb.types import Binary, TypeSerializer, TypeDeserializer

class Key:
    def __init__(self, name: str): ...
    def eq(self, value) -> ConditionBase: ...
    def between(self, low_value, high_value) -> ConditionBase: ...

class Binary:
    def __init__(self, value: bytes): ...
```

[DynamoDB Operations](./dynamodb-operations.md)

### S3 Transfer Operations

High-level S3 transfer functionality with automatic multipart handling, progress callbacks, and retry logic. Includes upload/download methods and transfer configuration.

```python { .api }
from boto3.s3.transfer import TransferConfig

class TransferConfig:
    def __init__(self, multipart_threshold: int = 8*1024*1024, 
                 max_concurrency: int = 10, **kwargs): ...

# Methods automatically injected into S3 clients and resources
def upload_file(filename: str, bucket: str, key: str, **kwargs) -> None: ...
def download_file(bucket: str, key: str, filename: str, **kwargs) -> None: ...
```

[S3 Transfer Operations](./s3-transfer-operations.md)

### EC2 Operations

EC2-specific functionality including tag management operations. These methods are automatically injected into EC2 service resources and instances.

```python { .api }
# Methods automatically injected into EC2 service resource and instance resources
def create_tags(resources: List[str], tags: List[Dict[str, str]]) -> List: ...
def delete_tags(tags: List[Dict[str, str]] = None) -> None: ...
```

[EC2 Operations](./ec2-operations.md)

### Utility Functions

SDK utility functions for logging, module imports, and internal functionality. Includes debugging helpers and service context management.

```python { .api }
def set_stream_logger(name: str = 'boto3', level: int = logging.DEBUG, 
                     format_string: str = None) -> None: ...

class ServiceContext:
    def __init__(self, service_name: str, service_model, 
                 service_waiter_model, resource_json_definitions: dict): ...
```

[Utility Functions](./utility-functions.md)

## Types

```python { .api }
# Core type aliases
from typing import Dict, List, Any, Optional, Union
from botocore.client import BaseClient
from boto3.resources.base import ServiceResource

# Configuration types  
class Config:
    def __init__(self, region_name: str = None, signature_version: str = None,
                 s3: Dict[str, Any] = None, retries: Dict[str, Any] = None,
                 user_agent_extra: str = None, **kwargs): ...

# Common response structures
ResponseMetadata = Dict[str, Any]  # Contains RequestId, HTTPStatusCode, etc.
```