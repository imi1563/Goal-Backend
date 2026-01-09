FROM node:20

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install  && echo "Dependencies installed successfully"

# Copy the rest of the application code
COPY . .

# Expose the application port
EXPOSE 3029

# Run the application

CMD ["npm", "run","start"]
