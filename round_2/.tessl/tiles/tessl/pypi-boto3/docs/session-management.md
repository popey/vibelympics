# Session Management

Core session functionality for managing AWS credentials, regions, and service configuration. Sessions provide both simple default usage patterns and advanced configuration scenarios, serving as the foundation for all AWS service interactions in boto3.

## Capabilities

### Default Session Functions

Convenience functions that operate on the global default session, providing the simplest way to create AWS service clients and resources.

```python { .api }
def client(service_name: str, region_name: str = None, api_version: str = None,
           use_ssl: bool = True, verify: Union[bool, str] = None, 
           endpoint_url: str = None, aws_access_key_id: str = None,
           aws_secret_access_key: str = None, aws_session_token: str = None,
           config = None, aws_account_id: str = None) -> BaseClient:
    """
    Create a low-level service client by name using the default session.
    
    Parameters:
    - service_name: AWS service name (e.g., 's3', 'ec2', 'dynamodb')
    - region_name: AWS region name (e.g., 'us-east-1')  
    - api_version: Specific API version to use
    - use_ssl: Whether to use SSL/TLS
    - verify: SSL certificate verification (True/False or path to CA bundle)
    - endpoint_url: Custom endpoint URL
    - aws_access_key_id: Override access key ID
    - aws_secret_access_key: Override secret access key
    - aws_session_token: Override session token
    - config: Advanced client configuration (botocore.client.Config)
    - aws_account_id: AWS account ID
    
    Returns:
    Low-level service client instance
    """

def resource(service_name: str, region_name: str = None, api_version: str = None,
             use_ssl: bool = True, verify: Union[bool, str] = None,
             endpoint_url: str = None, aws_access_key_id: str = None,
             aws_secret_access_key: str = None, aws_session_token: str = None,
             config = None) -> ServiceResource:
    """
    Create a resource service client by name using the default session.
    
    Parameters:
    - service_name: AWS service name (e.g., 's3', 'ec2', 'dynamodb')
    - region_name: AWS region name
    - api_version: Specific API version to use
    - use_ssl: Whether to use SSL/TLS
    - verify: SSL certificate verification
    - endpoint_url: Custom endpoint URL
    - aws_access_key_id: Override access key ID
    - aws_secret_access_key: Override secret access key
    - aws_session_token: Override session token
    - config: Advanced client configuration
    
    Returns:
    High-level service resource instance
    """

def setup_default_session(aws_access_key_id: str = None, 
                         aws_secret_access_key: str = None,
                         aws_session_token: str = None, region_name: str = None,
                         botocore_session = None, profile_name: str = None,
                         aws_account_id: str = None) -> None:
    """
    Set up a default session with custom parameters.
    
    Parameters:
    - aws_access_key_id: AWS access key ID
    - aws_secret_access_key: AWS secret access key  
    - aws_session_token: AWS session token for temporary credentials
    - region_name: Default AWS region
    - botocore_session: Existing botocore session to use
    - profile_name: AWS credentials profile name
    - aws_account_id: AWS account ID
    """
```

### Session Class

The Session class provides explicit credential and configuration management, allowing multiple sessions with different settings within the same application.

```python { .api }
class Session:
    def __init__(self, aws_access_key_id: str = None, 
                 aws_secret_access_key: str = None,
                 aws_session_token: str = None, region_name: str = None,
                 botocore_session = None, profile_name: str = None,
                 aws_account_id: str = None):
        """
        Initialize a new session with AWS credentials and configuration.
        
        Parameters:
        - aws_access_key_id: AWS access key ID
        - aws_secret_access_key: AWS secret access key
        - aws_session_token: AWS session token for temporary credentials
        - region_name: Default AWS region for this session
        - botocore_session: Use existing botocore session instead of creating new one
        - profile_name: AWS credentials profile name to use
        - aws_account_id: AWS account ID
        """
    
    @property
    def profile_name(self) -> str:
        """The read-only profile name (returns 'default' if none specified)."""
    
    @property  
    def region_name(self) -> str:
        """The read-only region name for this session."""
    
    @property
    def events(self):
        """The event emitter for this session."""
    
    @property
    def available_profiles(self) -> List[str]:
        """List of available AWS credential profiles."""
    
    def client(self, service_name: str, region_name: str = None, 
               api_version: str = None, use_ssl: bool = True,
               verify: Union[bool, str] = None, endpoint_url: str = None,
               aws_access_key_id: str = None, aws_secret_access_key: str = None,
               aws_session_token: str = None, config = None,
               aws_account_id: str = None) -> BaseClient:
        """Create a low-level service client using this session."""
    
    def resource(self, service_name: str, region_name: str = None,
                 api_version: str = None, use_ssl: bool = True,
                 verify: Union[bool, str] = None, endpoint_url: str = None,
                 aws_access_key_id: str = None, aws_secret_access_key: str = None,
                 aws_session_token: str = None, config = None) -> ServiceResource:
        """Create a resource service client using this session."""
```

### Service Discovery Methods

Methods for discovering available AWS services, regions, and API versions supported by the current boto3 installation.

```python { .api }
class Session:
    def get_available_services(self) -> List[str]:
        """
        Get list of AWS services available for low-level client creation.
        
        Returns:
        List of service names (e.g., ['s3', 'ec2', 'dynamodb', ...])
        """
    
    def get_available_resources(self) -> List[str]:
        """
        Get list of AWS services available for resource creation.
        
        Returns:
        List of service names that support resource interfaces
        """
    
    def get_available_partitions(self) -> List[str]:
        """
        Get list of available AWS partitions.
        
        Returns:
        List of partition names (e.g., ['aws', 'aws-cn', 'aws-us-gov'])
        """
    
    def get_available_regions(self, service_name: str, partition_name: str = 'aws',
                             allow_non_regional: bool = False) -> List[str]:
        """
        Get list of regions where a service is available.
        
        Parameters:
        - service_name: AWS service name (e.g., 's3')
        - partition_name: AWS partition name
        - allow_non_regional: Include non-regional endpoints
        
        Returns:
        List of region names (e.g., ['us-east-1', 'us-west-2', ...])
        """
    
    def get_partition_for_region(self, region_name: str) -> str:
        """
        Get the partition name for a specific region.
        
        Parameters:
        - region_name: AWS region name
        
        Returns:
        Partition name (e.g., 'aws')
        """
```

### Credential Management

Methods for accessing and managing AWS credentials within a session.

```python { .api }
class Session:
    def get_credentials(self):
        """
        Get the credentials object for this session.
        
        Returns:
        botocore.credentials.Credentials object with access keys and tokens
        """
```

## Usage Examples

### Basic Default Session Usage

```python
import boto3

# Create clients using the default session
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb', region_name='us-west-2')

# List S3 buckets
buckets = s3.list_buckets()
```

### Custom Session Configuration

```python
from boto3 import Session

# Create session with specific credentials and region
session = Session(
    aws_access_key_id='AKIAEXAMPLE',
    aws_secret_access_key='secret',
    region_name='eu-west-1'
)

# Create services using the custom session
s3 = session.client('s3')
ec2 = session.resource('ec2')
```

### Profile-based Session

```python
from boto3 import Session

# Use a specific AWS credentials profile
session = Session(profile_name='production')
dynamodb = session.resource('dynamodb')
```

### Service Discovery

```python
import boto3

session = boto3.Session()

# Discover available services
services = session.get_available_services()
print(f"Available services: {services[:5]}...")  # First 5 services

# Find regions for S3
s3_regions = session.get_available_regions('s3')
print(f"S3 regions: {s3_regions[:3]}...")  # First 3 regions
```