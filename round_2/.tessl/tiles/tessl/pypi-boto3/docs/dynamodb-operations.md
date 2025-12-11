# DynamoDB Operations

High-level DynamoDB functionality including condition expressions, type serialization, and table operations. Provides pythonic interfaces for DynamoDB's attribute-value model, making it easier to work with DynamoDB's unique data types and query patterns.

## Capabilities

### Condition Expressions

Condition classes for building DynamoDB filter expressions, key conditions, and update conditions. These provide a pythonic way to construct the condition expressions required by DynamoDB operations.

```python { .api }
from boto3.dynamodb.conditions import Key, Attr

class Key:
    """
    Key attribute reference for DynamoDB key conditions.
    Used in query operations to specify which partition key and sort key values to retrieve.
    """
    
    def __init__(self, name: str):
        """
        Parameters:
        - name: The key attribute name
        """
    
    def eq(self, value) -> ConditionBase:
        """Create equality condition (key = value)."""
    
    def lt(self, value) -> ConditionBase:
        """Create less than condition (key < value)."""
    
    def lte(self, value) -> ConditionBase:
        """Create less than or equal condition (key <= value)."""
    
    def gt(self, value) -> ConditionBase:
        """Create greater than condition (key > value)."""
    
    def gte(self, value) -> ConditionBase:
        """Create greater than or equal condition (key >= value)."""
    
    def begins_with(self, value) -> ConditionBase:
        """Create begins with condition for string keys."""
    
    def between(self, low_value, high_value) -> ConditionBase:
        """Create between condition (low_value <= key <= high_value)."""

class Attr:
    """
    General attribute reference for DynamoDB filter conditions.
    Used in filter expressions to specify conditions on non-key attributes.
    """
    
    def __init__(self, name: str):
        """
        Parameters:
        - name: The attribute name
        """
    
    def eq(self, value) -> ConditionBase:
        """Create equality condition (attribute = value)."""
    
    def ne(self, value) -> ConditionBase:
        """Create not equal condition (attribute <> value)."""
    
    def lt(self, value) -> ConditionBase:
        """Create less than condition."""
    
    def lte(self, value) -> ConditionBase:
        """Create less than or equal condition."""
    
    def gt(self, value) -> ConditionBase:
        """Create greater than condition."""
    
    def gte(self, value) -> ConditionBase:
        """Create greater than or equal condition."""
    
    def begins_with(self, value) -> ConditionBase:
        """Create begins with condition for string attributes."""
    
    def between(self, low_value, high_value) -> ConditionBase:
        """Create between condition."""
    
    def is_in(self, values: List) -> ConditionBase:
        """Create IN condition (attribute IN (value1, value2, ...))."""
    
    def exists(self) -> ConditionBase:
        """Create attribute exists condition."""
    
    def not_exists(self) -> ConditionBase:
        """Create attribute does not exist condition."""
    
    def contains(self, value) -> ConditionBase:
        """Create contains condition for strings and sets."""
    
    def size(self) -> Size:
        """Return Size object for size-based conditions."""
    
    def attribute_type(self, type_name: str) -> ConditionBase:
        """Create attribute type condition to check attribute's data type."""

class Size:
    """
    Size-based conditions for DynamoDB attributes.
    Used to create conditions based on the size of strings, sets, lists, or maps.
    """
    
    def eq(self, value: int) -> ConditionBase:
        """Create size equals condition."""
    
    def ne(self, value: int) -> ConditionBase:
        """Create size not equal condition."""
    
    def lt(self, value: int) -> ConditionBase:
        """Create size less than condition."""
    
    def lte(self, value: int) -> ConditionBase:
        """Create size less than or equal condition."""
    
    def gt(self, value: int) -> ConditionBase:
        """Create size greater than condition."""
    
    def gte(self, value: int) -> ConditionBase:
        """Create size greater than or equal condition."""
    
    def between(self, low_value: int, high_value: int) -> ConditionBase:
        """Create size between condition."""
```

### Condition Base Classes and Logical Operators

Base classes for conditions and logical operators for combining multiple conditions.

```python { .api }
class ConditionBase:
    """
    Base class for all DynamoDB conditions.
    Supports logical operations to combine conditions.
    """
    
    def __and__(self, other: ConditionBase) -> And:
        """Combine conditions with logical AND (&)."""
    
    def __or__(self, other: ConditionBase) -> Or:
        """Combine conditions with logical OR (|)."""
    
    def __invert__(self) -> Not:
        """Negate condition with logical NOT (~)."""

class And(ConditionBase):
    """Logical AND combination of conditions."""

class Or(ConditionBase):
    """Logical OR combination of conditions."""

class Not(ConditionBase):
    """Logical NOT negation of a condition."""
```

### Type Serialization

Classes for converting between Python data types and DynamoDB's attribute value format.

```python { .api }
from boto3.dynamodb.types import Binary, TypeSerializer, TypeDeserializer

class Binary:
    """
    Wrapper for binary data in DynamoDB.
    
    DynamoDB requires binary data to be explicitly marked as binary type.
    This class wraps bytes objects to indicate they should be stored as binary.
    """
    
    def __init__(self, value: bytes):
        """
        Parameters:
        - value: Binary data as bytes
        """
        self.value = value

class TypeSerializer:
    """
    Serializes Python data types to DynamoDB attribute value format.
    
    Converts standard Python types (str, int, float, bool, list, dict, set, bytes)
    to the attribute value format required by DynamoDB's low-level API.
    """
    
    def serialize(self, obj) -> Dict[str, Any]:
        """
        Serialize a Python value to DynamoDB format.
        
        Parameters:
        - obj: Python value to serialize
        
        Returns:
        Dictionary in DynamoDB attribute value format (e.g., {'S': 'string_value'})
        """

class TypeDeserializer:
    """
    Deserializes DynamoDB attribute values to Python data types.
    
    Converts DynamoDB's attribute value format back to standard Python types.
    """
    
    def deserialize(self, value: Dict[str, Any]):
        """
        Deserialize a DynamoDB attribute value to Python format.
        
        Parameters:
        - value: DynamoDB attribute value (e.g., {'S': 'string_value'})
        
        Returns:
        Python value in native type
        """
```

### DynamoDB Type Constants

Constants representing DynamoDB data types for use in type checking and serialization.

```python { .api }
# DynamoDB type identifiers
STRING = 'S'           # String type
NUMBER = 'N'           # Number type  
BINARY = 'B'           # Binary type
STRING_SET = 'SS'      # String set type
NUMBER_SET = 'NS'      # Number set type
BINARY_SET = 'BS'      # Binary set type
NULL = 'NULL'          # Null type
BOOLEAN = 'BOOL'       # Boolean type
MAP = 'M'              # Map (dictionary) type
LIST = 'L'             # List type

# Decimal context for DynamoDB number precision
DYNAMODB_CONTEXT: Context  # Decimal context with DynamoDB-compatible precision

# Valid binary data types
BINARY_TYPES = (bytearray, bytes)
```

## Usage Examples

### Basic Condition Usage

```python
import boto3
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('my-table')

# Query with key condition
response = table.query(
    KeyConditionExpression=Key('pk').eq('USER#123') & Key('sk').begins_with('ORDER#')
)

# Scan with filter condition
response = table.scan(
    FilterExpression=Attr('status').eq('active') & Attr('created_date').gte('2023-01-01')
)
```

### Complex Condition Expressions

```python
from boto3.dynamodb.conditions import Key, Attr

# Complex key condition for query
key_condition = Key('pk').eq('USER#123') & Key('sk').between('ORDER#2023-01-01', 'ORDER#2023-12-31')

# Complex filter with multiple conditions
filter_condition = (
    Attr('status').is_in(['active', 'pending']) &
    Attr('amount').gt(100) &
    Attr('tags').contains('priority') &
    ~Attr('deleted').exists()  # NOT exists using ~ operator
)

response = table.query(
    KeyConditionExpression=key_condition,
    FilterExpression=filter_condition
)
```

### Type Serialization Example

```python
from boto3.dynamodb.types import Binary, TypeSerializer, TypeDeserializer

# Create binary data
binary_data = Binary(b'Hello, World!')

# Serialize Python data to DynamoDB format
serializer = TypeSerializer()
item_data = {
    'name': 'John Doe',
    'age': 30,
    'active': True,
    'tags': {'priority', 'vip'},
    'metadata': {'created': '2023-01-01', 'version': 1},
    'profile_image': binary_data
}

# Serialize the entire item
serialized_item = {k: serializer.serialize(v) for k, v in item_data.items()}

# Deserialize DynamoDB response back to Python
deserializer = TypeDeserializer()
python_item = {k: deserializer.deserialize(v) for k, v in serialized_item.items()}
```

### Working with Sets and Lists

```python
from boto3.dynamodb.conditions import Attr

# Query items where a set contains a specific value
response = table.scan(
    FilterExpression=Attr('categories').contains('electronics')
)

# Query items based on list size
response = table.scan(
    FilterExpression=Attr('items').size().gt(5)
)

# Query items with nested attribute conditions
response = table.scan(
    FilterExpression=Attr('address.city').eq('New York')
)
```

### Update Expressions with Conditions

```python
from boto3.dynamodb.conditions import Attr

# Conditional update - only update if condition is met
try:
    response = table.update_item(
        Key={'pk': 'USER#123', 'sk': 'PROFILE'},
        UpdateExpression='SET #status = :status, last_updated = :timestamp',
        ConditionExpression=Attr('version').eq(1),  # Only update if version is 1
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':status': 'inactive',
            ':timestamp': '2023-12-01T10:00:00Z'
        },
        ReturnValues='ALL_NEW'
    )
except ClientError as e:
    if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
        print("Update failed: condition not met")
    else:
        raise
```

### Transaction Operations with Conditions

```python
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource('dynamodb')

# Transactional write with conditions
try:
    dynamodb.meta.client.transact_write_items(
        TransactItems=[
            {
                'Update': {
                    'TableName': 'accounts',
                    'Key': {'account_id': {'S': 'account1'}},
                    'UpdateExpression': 'SET balance = balance - :amount',
                    'ConditionExpression': 'balance >= :amount',
                    'ExpressionAttributeValues': {':amount': {'N': '100'}}
                }
            },
            {
                'Update': {
                    'TableName': 'accounts', 
                    'Key': {'account_id': {'S': 'account2'}},
                    'UpdateExpression': 'SET balance = balance + :amount',
                    'ExpressionAttributeValues': {':amount': {'N': '100'}}
                }
            }
        ]
    )
except ClientError as e:
    if e.response['Error']['Code'] == 'TransactionCanceledException':
        print("Transaction failed: conditions not met")
    else:
        raise
```