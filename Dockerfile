# Jinja2 Template idea from: https://tryolabs.com/blog/2015/03/26/configurable-docker-containers-for-multiple-environments/

FROM mediainbox/base

# Maintener
MAINTAINER Alejandro Ferrari <aferrari@mediainbox.net>

# Change localtime
RUN rm /etc/localtime && ln -s /usr/share/zoneinfo/Etc/UTC /etc/localtime

RUN apk add --update \
    python \
    python-dev \
    py-pip \
    py-setuptools \
    build-base \
    tar \
    bzip2 \
    nasm \
    git \
    bash \
    curl
RUN pip install --upgrade pip && pip install j2cli

WORKDIR /srv
RUN git clone https://github.com/mediainbox/sm-archiver.git
# Master Branch
RUN cd sm-archiver && npm install && npm run compile:v8
RUN cd sm-archiver && cp -a src/archiver/monitors/v8/* js/src/archiver/monitors/v8/
COPY archiver.json.j2 /config/
COPY docker-entrypoint.sh /

VOLUME "/config"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["sm-archiver/runner-cmd", "--config", "/config/archiver.json"]
