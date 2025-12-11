# EC2 Operations

EC2-specific functionality including tag management operations. These methods are automatically injected into EC2 service resources and instance resources, providing convenient Python interfaces for managing EC2 tags without needing to work directly with low-level client APIs.

## Capabilities

### Tag Management for Service Resource

Tag management methods available on the EC2 service resource for applying tags to multiple resources simultaneously.

```python { .api }
# Methods available on EC2 service resource (boto3.resource('ec2'))
def create_tags(self, resources: List[str], tags: List[Dict[str, str]], 
                dry_run: bool = None, **kwargs) -> List:
    """
    Create tags on one or more EC2 resources.
    
    This method allows applying a set of tags to multiple EC2 resources
    in a single operation and returns Tag resource objects for each
    created tag.
    
    Parameters:
    - resources: List of EC2 resource IDs to tag (e.g., ['i-1234567890abcdef0'])
    - tags: List of tag dictionaries with 'Key' and 'Value' keys
    - dry_run: Perform a dry run without actually creating tags
    - **kwargs: Additional parameters passed to the underlying create_tags API
    
    Returns:
    List of Tag resource objects for each created tag
    
    Example tags format:
    [{'Key': 'Environment', 'Value': 'Production'}, {'Key': 'Owner', 'Value': 'TeamA'}]
    """
```

### Tag Management for Instance Resource

Tag management methods available on individual EC2 instance resources for managing tags on specific instances.

```python { .api }
# Methods available on EC2 Instance resources
def delete_tags(self, tags: List[Dict[str, str]] = None, dry_run: bool = None,
                **kwargs) -> None:
    """
    Delete tags from this EC2 instance.
    
    This method is automatically injected into EC2 Instance resources
    and allows deletion of specific tags from the instance.
    
    Parameters:
    - tags: List of tag dictionaries to delete. If not specified, all tags are deleted
    - dry_run: Perform a dry run without actually deleting tags
    - **kwargs: Additional parameters passed to the underlying delete_tags API
    
    Tag format for deletion:
    - To delete specific tags: [{'Key': 'Environment'}, {'Key': 'Owner'}]
    - To delete tags with specific values: [{'Key': 'Environment', 'Value': 'Test'}]
    - If tags parameter is None, all tags on the resource are deleted
    """
```

### Injected Tag Methods

These methods are automatically added to EC2 resources during resource creation and are not part of the base resource classes.

```python { .api }
# The injection mechanism adds these methods dynamically
from boto3.ec2.createtags import create_tags
from boto3.ec2.deletetags import delete_tags

# Internal functions used for method injection
def inject_create_tags(event_name: str, class_attributes: dict, **kwargs) -> None:
    """Inject create_tags method onto EC2 service resource."""

def inject_delete_tags(event_emitter, **kwargs) -> None:
    """Inject delete_tags method onto EC2 instance resources."""
```

## Usage Examples

### Creating Tags on Multiple Resources

```python
import boto3

ec2_resource = boto3.resource('ec2', region_name='us-east-1')

# Create tags on multiple EC2 resources
tag_resources = ec2_resource.create_tags(
    resources=[
        'i-1234567890abcdef0',  # Instance ID
        'vol-1234567890abcdef0',  # Volume ID
        'sg-1234567890abcdef0'   # Security Group ID
    ],
    tags=[
        {'Key': 'Environment', 'Value': 'Production'},
        {'Key': 'Project', 'Value': 'WebApp'},
        {'Key': 'Owner', 'Value': 'TeamA'}
    ]
)

# The method returns Tag resource objects
print(f"Created {len(tag_resources)} tag resources")
for tag in tag_resources:
    print(f"Tag: {tag.key} = {tag.value} on resource {tag.resource_id}")
```

### Working with Instance Tags

```python
import boto3

ec2_resource = boto3.resource('ec2', region_name='us-east-1')

# Get a specific instance
instance = ec2_resource.Instance('i-1234567890abcdef0')

# Create tags on the instance using the service resource method
ec2_resource.create_tags(
    resources=[instance.id],
    tags=[
        {'Key': 'Name', 'Value': 'WebServer-01'},
        {'Key': 'Role', 'Value': 'WebServer'}
    ]
)

# Delete specific tags from the instance using the instance method
instance.delete_tags(
    tags=[
        {'Key': 'Role'},  # Delete tag by key only
        {'Key': 'OldTag', 'Value': 'OldValue'}  # Delete specific key-value pair
    ]
)
```

### Tag Management with Error Handling

```python
import boto3
from botocore.exceptions import ClientError

ec2_resource = boto3.resource('ec2', region_name='us-east-1')
instance = ec2_resource.Instance('i-1234567890abcdef0')

try:
    # Create tags with dry run to validate permissions
    ec2_resource.create_tags(
        resources=[instance.id],
        tags=[{'Key': 'Test', 'Value': 'DryRun'}],
        dry_run=True
    )
    print("Dry run successful - permissions are correct")
    
    # Perform actual tag creation
    tag_resources = ec2_resource.create_tags(
        resources=[instance.id],
        tags=[
            {'Key': 'Environment', 'Value': 'Staging'},
            {'Key': 'Application', 'Value': 'API-Server'}
        ]
    )
    print(f"Successfully created {len(tag_resources)} tags")
    
except ClientError as e:
    error_code = e.response['Error']['Code']
    if error_code == 'DryRunOperation':
        print("Dry run completed successfully")
    elif error_code == 'UnauthorizedOperation':
        print("Insufficient permissions to create tags")
    elif error_code == 'InvalidInstanceID.NotFound':
        print("Instance not found")
    else:
        print(f"Error creating tags: {e}")
```

### Batch Tag Operations

```python
import boto3

ec2_resource = boto3.resource('ec2', region_name='us-east-1')

# Tag multiple instances with common tags
instance_ids = ['i-1234567890abcdef0', 'i-abcdef1234567890', 'i-567890abcdef1234']

# Apply common tags to all instances
common_tags = [
    {'Key': 'Project', 'Value': 'DataPipeline'},
    {'Key': 'Environment', 'Value': 'Production'},
    {'Key': 'ManagedBy', 'Value': 'AutoScaling'}
]

tag_resources = ec2_resource.create_tags(
    resources=instance_ids,
    tags=common_tags
)

print(f"Applied {len(common_tags)} tags to {len(instance_ids)} instances")

# Remove specific tags from all instances
for instance_id in instance_ids:
    instance = ec2_resource.Instance(instance_id)
    instance.delete_tags(
        tags=[{'Key': 'ManagedBy'}]  # Remove ManagedBy tag
    )
    print(f"Removed ManagedBy tag from {instance_id}")
```

### Working with Existing Tags

```python
import boto3

ec2_resource = boto3.resource('ec2', region_name='us-east-1')
instance = ec2_resource.Instance('i-1234567890abcdef0')

# View existing tags before modification
print("Current tags:")
for tag in instance.tags or []:
    print(f"  {tag['Key']}: {tag['Value']}")

# Add new tags while preserving existing ones
new_tags = [
    {'Key': 'BackupSchedule', 'Value': 'Daily'},
    {'Key': 'MaintenanceWindow', 'Value': 'Sunday-02:00-04:00'}
]

ec2_resource.create_tags(
    resources=[instance.id],
    tags=new_tags
)

# Refresh instance to see updated tags
instance.reload()
print("\nUpdated tags:")
for tag in instance.tags or []:
    print(f"  {tag['Key']}: {tag['Value']}")
```

### Using Tags for Resource Management

```python
import boto3

ec2_resource = boto3.resource('ec2', region_name='us-east-1')

# Find instances by tag and update them
instances = ec2_resource.instances.filter(
    Filters=[
        {'Name': 'tag:Environment', 'Values': ['Development']},
        {'Name': 'instance-state-name', 'Values': ['running']}
    ]
)

development_instance_ids = [instance.id for instance in instances]

if development_instance_ids:
    # Tag all development instances with additional metadata
    ec2_resource.create_tags(
        resources=development_instance_ids,
        tags=[
            {'Key': 'AutoShutdown', 'Value': 'Enabled'},
            {'Key': 'ShutdownTime', 'Value': '18:00'},
            {'Key': 'LastUpdated', 'Value': '2023-12-01'}
        ]
    )
    print(f"Updated {len(development_instance_ids)} development instances")
```