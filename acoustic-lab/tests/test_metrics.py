from acoustic_lab.metrics.angular import angular_error_deg


def test_angular_error_wrap():
    assert angular_error_deg(179, -179) == 2
    assert angular_error_deg(-179, 179) == 2
