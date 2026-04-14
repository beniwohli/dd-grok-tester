import pytest
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:3001/api"

# For tests that don't include a year, VRL uses the current year.
CURRENT_YEAR = datetime.now().year

def get_timestamp(date_str, fmt="%Y-%m-%dT%H:%M:%S"):
    dt = datetime.strptime(date_str, fmt)
    return int(dt.timestamp() * 1000)

EXAMPLES = [
  {
    "name": "Classic unstructured log",
    "rule": '%{word:user} connected on %{date("MM/dd/yyyy"):date}',
    "sample": "john connected on 11/08/2017",
    "expected": {
      "user": "john",
      "date": 1510099200000
    }
  },
  {
    "name": "Key value or logfmt",
    "rule": "%{data::keyvalue}",
    "sample": "user=john connect_date=11/08/2017 id=123 action=click",
    "expected": {
      "user": "john",
      "id": 123,
      "action": "click"
    },
  },
  {
    "name": "Parsing dates",
    "rule": "%{date(\"HH:mm:ss\"):date}",
    "sample": "14:20:15",
    "expected": {
      "date": 1776090015000
    }
  },
  {
    "name": "Alternating pattern",
    "rule": "(%{integer:user.id}|%{word:user.firstname}) connected on %{date(\"MM/dd/yyyy\"):connect_date}",
    "sample": "john connected on 11/08/2017",
    "expected": {
      "user": {
        "firstname": "john"
      },
      "connect_date": 1510099200000
    }
  },
    {
    "name": "Alternating pattern 2",
    "rule": "(%{integer:user.id}|%{word:user.firstname}) connected on %{date(\"MM/dd/yyyy\"):connect_date}",
    "sample": "123 connected on 11/08/2017",
    "expected": {
      "connect_date": 1510099200000,
      "user": {
        "id": 123
      }
    }
  },
  {
    "name": "Optional attribute",
    "rule": "%{word:user.firstname} (%{integer:user.id} )?connected on %{date(\"MM/dd/yyyy\"):connect_date}",
    "sample": "john 1234 connected on 11/08/2017",
    "expected": {
      "user": {
        "firstname": "john",
        "id": 1234
      },
      "connect_date": 1510099200000
    }
  },
  {
    "name": "Nested JSON",
    "rule": "%{date(\"MMM dd HH:mm:ss\"):timestamp} %{word:vm} %{word:app}\\[%{number:logger.thread_id}\\]: %{notSpace:server} %{data::json}",
    "sample": "Sep 06 09:13:38 vagrant program[123]: server.1 {\"method\":\"GET\", \"status_code\":200, \"url\":\"https://app.datadoghq.com/logs/pipelines\", \"duration\":123456}",
    "expected": {
      "vm": "vagrant",
      "app": "program",
      "logger": {
        "thread_id": 123
      }
    },
  },
  {
    "name": "Regex",
    "rule": "%{regex(\"[a-z]*\"):user.firstname}_%{regex(\"[a-zA-Z0-9]*\"):user.id} .*",
    "sample": "john_1a2b3c4 connected on 11/08/2017",
    "expected": {
      "user": {
        "firstname": "john",
        "id": "1a2b3c4"
      }
    }
  },
  {
    "name": "List to array",
    "rule": "Users %{data:users:array(\"[]\",\",\")} have been added to the database",
    "sample": "Users [John, Oliver, Marc, Tom] have been added to the database",
    "expected": {
      "users": [
        "John",
        " Oliver",
        " Marc",
        " Tom"
      ]
    },
  },
  {
    "name": "Glog format",
    "rule": "%{regex(\"\\\\w\"):level}%{date(\"MMdd HH:mm:ss.SSSSSS\"):timestamp}\\s+%{number:logger.thread_id} %{notSpace:logger.name}:%{number:logger.lineno}\\] %{data:msg}",
    "sample": "W0424 11:47:41.605188       1 authorization.go:47] Authorization is disabled",
    "expected": {
      "level": "W",
      "timestamp": 1777031261605,
      "logger": {
        "thread_id": 1,
        "name": "authorization.go",
        "lineno": 47,
      },
      "msg": "Authorization is disabled"
    }
  },
  {
    "name": "Parsing XML",
    "rule": "%{data::xml}",
    "sample": "<book category=\"CHILDREN\">\n  <title lang=\"en\">Harry Potter</title>\n  <author>J K. Rowling</author>\n  <year>2005</year>\n</book>",
    "expected": {
      "book": {
        "year": "2005"
      }
    },
    "datadog_specific": True
  },
  {
    "name": "Parsing CSV",
    "rule": "%{data:user:csv(\"first_name,name,st_nb,st_name,city\")}",
    "sample": "John,Doe,120,Jefferson St.,Riverside",
    "expected": {
      "user": {
        "first_name": "John"
      }
    },
    "datadog_specific": True
  },
  {
    "name": "Use data matcher to discard unneeded text",
    "rule": "Usage\\:\\s+%{number:usage}%{data:ignore}",
    "sample": "Usage: 24.3%",
    "expected": {
      "usage": 24.3,
      "ignore": "%"
    }
  }
]

@pytest.mark.parametrize("example", EXAMPLES, ids=lambda x: x["name"])
def test_datadog_example(example):
    if example.get("datadog_specific"):
        pytest.xfail("Uses Datadog-specific post-processing matcher not natively auto-expanded by VRL's parse_groks!")

    payload = {
        "sample": example["sample"],
        "match_rules": f"rule {example['rule']}",
        "support_rules": ""
    }

    response = requests.post(f"{BASE_URL}/parse", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["error"] is None, f"Parsing failed for {example['name']}: {data['error']}"

    parsed = data["parsed"]
    assert parsed is not None, f"Match failed for {example['name']}. No results returned."

    # Filter actual results to only include the keys we expect to see
    actual = {k: v for k, v in parsed.items() if k in example["expected"]}

    # Direct dictionary comparison for clear pytest diffs
    assert actual == example["expected"]

def test_health():
    try:
        requests.get(BASE_URL.replace("/api", "/"))
    except requests.exceptions.ConnectionError:
        pytest.fail("Server is not running on http://localhost:3001. Please start it first.")
