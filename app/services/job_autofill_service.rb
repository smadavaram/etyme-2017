# app/services/job_autofill_service.rb
class JobAutofillService
  # Add available options for each field
  STATUS_OPTIONS = ["Draft", "Bench", "Published", "Archived", "Cancelled"]
  LISTING_TYPE_OPTIONS = ["Job", "Training", "Service", "Product", "Blog"]
  DEPARTMENT_OPTIONS = ["Engineering", "Marketing", "Sales", "HR"] # Add actual options
  INDUSTRY_OPTIONS = ["Software Development", "Finance", "Healthcare"] # Add actual options
  WORK_TYPE_OPTIONS = WORK_CATEGORIES.keys
  JOB_TYPE_OPTIONS = ["Contract", "Full Time", "Contract To Hire"]

  def initialize(description)
    @description = description
  end

  def call
    uri = URI("https://api.openai.com/v1/chat/completions")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    request = Net::HTTP::Post.new(uri.path, {
      'Content-Type': 'application/json',
      'Authorization': "Bearer #{ENV['OPENAI_API_KEY']}"
    })

    question = generate_prompt(@description)

    request.body = {
      model: "gpt-4",
      messages: [{ role: "user", content: question }]
    }.to_json

    begin
      response = http.request(request)
      parsed_response = JSON.parse(response.body)

      content = parsed_response.dig("choices", 0, "message", "content")
    rescue JSON::ParserError => e
      return {error:  "Error parsing JSON: #{e.message}" }
    rescue Errno::ECONNREFUSED => e
      # Handle the connection error gracefully
      return { error: "Failed to connect to the website. Please check the URL and try again later." }
    rescue StandardError => e
      # Handle any other unexpected errors
      return { error: "An unexpected error occurred: #{e.message}" }
    end

    extract_data_from_response(content)
  end

  private

  def generate_prompt(description)
    <<~PROMPT
      You are a job details extractor. Given the following job description, extract and return the job title, education requirements, and other relevant job fields using the available options.

      Job Description: #{description}

      Available Options:
      - Status: #{STATUS_OPTIONS.join(', ')}
      - Department: #{DEPARTMENT_OPTIONS.join(', ')}
      - Industry: #{INDUSTRY_OPTIONS.join(', ')}
      - Work Type: #{WORK_TYPE_OPTIONS.join(', ')}
      - Job Type: #{JOB_TYPE_OPTIONS.join(', ')}

      Format your response in JSON format with the keys:
      - title
      - education_list (array)
      - status
      - department
      - industry
      - job_category
      - tag_list (array)
      - location
      - work_type
      - start_date
      - end_date
      - price
      - job_type

      Example Output:
      {
        "title": "Software Engineer",
        "education_list": ["Bachelor's Degree in Computer Science", "Master's in Computer Science"],
        "status": "Draft",
        "department": "Engineering",
        "industry": "Software Development",
        "job_category": "Development",
        "tag_list": ["Ruby", "Rails", "JavaScript"],
        "location": "Remote",
        "work_type": "Full Time",
        "start_date": "2024-09-01",
        "end_date": "2025-09-01",
        "price": "100000",
        "job_type": "Full Time"
      }
    PROMPT
  end

  def extract_data_from_response(response_text)
    JSON.parse(response_text) rescue {}
  end
end
