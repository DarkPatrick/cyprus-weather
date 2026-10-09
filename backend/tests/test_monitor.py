import monitor

NOW = 2_000_000_000


def test_problems_tell_broken_sync_from_broken_collector():
    assert monitor.problems(NOW, NOW - 600, NOW - 600, True) == []
    sync = monitor.problems(NOW, NOW - 3 * 3600, NOW - 600, True)
    assert len(sync) == 1 and 'sync from aranet4 is broken' in sync[0]
    collector = monitor.problems(NOW, NOW - 3 * 3600, NOW - 3 * 3600, True)
    assert 'collector is not updating' in collector[0]
    assert monitor.problems(NOW, NOW - 600, NOW - 600, False) == ['API is not answering']


def test_alert_once_remind_later_and_report_recovery():
    message, state = monitor.decide({}, ['API is not answering'], NOW)
    assert message['title'] == 'Kairo backend problem' and state['failing']
    assert monitor.decide(state, ['API is not answering'], NOW + 600)[0] is None
    reminder, state = monitor.decide(state, ['API is not answering'], NOW + monitor.REMIND_SECONDS)
    assert reminder['title'] == 'Kairo backend still failing' and state['since'] == NOW
    recovered, state = monitor.decide(state, [], NOW + monitor.REMIND_SECONDS + 600)
    assert recovered['title'] == 'Kairo backend recovered' and not state['failing']
    assert monitor.decide(state, [], NOW + monitor.REMIND_SECONDS + 1200)[0] is None
