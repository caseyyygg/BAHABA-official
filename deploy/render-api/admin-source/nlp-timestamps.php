<?php
/** Source publication and first collection are different timestamps. */
function bahaba_nlp_publication_time($value, ?DateTimeImmutable $clock = null): ?DateTimeImmutable {
    if ($value === null || $value === '') return null;
    // Relative dates and dates without a timezone can silently invent a year or
    // interpret an overseas collector's clock in the server's timezone.
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/D', $value)) {
        throw new InvalidArgumentException('timestamp must contain the original publication time in ISO 8601 format with a timezone.');
    }
    try {
        $published = new DateTimeImmutable($value);
        $errors = DateTimeImmutable::getLastErrors();
        if ($errors && ($errors['warning_count'] || $errors['error_count'])) throw new Exception('Invalid date');
    } catch (Exception $error) {
        throw new InvalidArgumentException('timestamp must be a valid original publication time.');
    }
    $now = $clock ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
    if ($published > $now) throw new InvalidArgumentException('Future-dated posts cannot enter the live feed.');
    if ($published < $now->modify('-24 hours')) throw new InvalidArgumentException('Only posts published within the last 24 hours can enter the live feed.');
    return $published->setTimezone(new DateTimeZone('UTC'));
}
