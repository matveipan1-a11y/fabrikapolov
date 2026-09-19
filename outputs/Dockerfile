FROM node:24-alpine
WORKDIR /app
COPY index.html styles.css styles-enhanced.css liquid.css script.js motion.js manifest.json service-worker.js server.js admin.html admin.js ./
COPY icons ./icons
RUN mkdir /data && chown node:node /data
USER node
ENV PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server.js"]
