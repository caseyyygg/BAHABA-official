FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libzip-dev unzip \
    && docker-php-ext-install pdo_mysql zip \
    && a2enmod rewrite headers \
    && sed -i 's/Listen 80/Listen 10000/' /etc/apache2/ports.conf \
    && sed -i 's/<VirtualHost \*:80>/<VirtualHost *:10000>/' /etc/apache2/sites-available/000-default.conf \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html

COPY bahaba-app/api/ /var/www/html/api/
COPY deploy/render-api/render-config.php /var/www/html/api/config.php
RUN mkdir -p /var/www/html/resident/api \
    && cp -a /var/www/html/api/. /var/www/html/resident/api/ \
    && rm -f /var/www/html/api/config.example.php /var/www/html/api/seed-test-accounts.php /var/www/html/api/schema.sql \
    && rm -f /var/www/html/resident/api/config.example.php /var/www/html/resident/api/seed-test-accounts.php /var/www/html/resident/api/schema.sql \
    && composer install --no-dev --no-interaction --prefer-dist --working-dir=/var/www/html/api

COPY deploy/render-api/admin-source/api.php /var/www/html/admin-api.php
COPY deploy/render-api/admin-source/nlp-location.php /var/www/html/nlp-location.php
COPY deploy/render-api/admin-source/report-point.php /var/www/html/report-point.php
COPY deploy/render-api/admin-source/report-management.php /var/www/html/report-management.php
COPY deploy/render-api/admin-source/nlp-threshold.php /var/www/html/nlp-threshold.php
COPY deploy/render-api/admin-source/collected-history.php /var/www/html/collected-history.php
COPY deploy/render-api/admin-source/team-deployments.php /var/www/html/team-deployments.php
COPY deploy/render-api/admin-source/social-accounts.php /var/www/html/social-accounts.php
COPY deploy/render-api/admin-source/team-barangays.json /var/www/html/team-barangays.json
COPY deploy/render-api/admin-source/map-data/ /var/www/html/map-data/
COPY bahaba-app/location-config.json /var/www/html/location-config.json
COPY bahaba-app/psgc-registry.json /var/www/html/psgc-registry.json
COPY deploy/render-api/healthz.php /var/www/html/healthz.php

RUN printf '<FilesMatch "^(config(\\.example)?\\.php|schema\\.sql|composer\\.(json|lock))$">\nRequire all denied\n</FilesMatch>\n' > /var/www/html/api/.htaccess \
    && cp /var/www/html/api/.htaccess /var/www/html/resident/api/.htaccess \
    && chown -R www-data:www-data /var/www/html

EXPOSE 10000
