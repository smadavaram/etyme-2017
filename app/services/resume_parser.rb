# frozen_string_literal: true

class ResumeParser
  attr_accessor :resume_url
  API_URL = ENV['rchilli_resume_parser_url']
  USER_ID = ENV['rchilli_user_id']
  USER_KEY = ENV['rchilli_user_key']
  VERSION = '7.0.0'

  def initialize(url)
    @resume_url = url
  end

  def binary_parse
    base64Data = Base64.encode64(open(@resume_url).read)
    uri = URI.parse(API_URL)
    String body = {
      filedata: base64Data,
      filename: @resume_url.split('/').last,
      userkey: USER_KEY,
      version: VERSION,
      subuserid: USER_ID
    }
    headers = {
      'Content-Type' => 'application/json',
      'Accept' => 'application/json'
    }
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    response = http.post(uri.path, body.to_json, headers)
  end

  def openai_parse
    filetype = @resume_url.split('.').last
    return unless filetype == 'pdf'

    pdf_string = +''
    resume_string = URI.open(@resume_url) do |file|
      reader = PDF::Reader.new(file)
      reader.pages.each { |page| pdf_string << page.text }
    end.join

    client = OpenAI::Client.new(access_token: ENV['openai_api_key'])
    openai_prompt = "Analyze the following resume and extract the person's work and education history along with their first name, last name, phone number, address, email, and birthdate. Please provide the response in the form of a JSON object, without any extra explanatory text. The object should contain the following attributes: \"first_name\", \"last_name\", \"phone_number\", \"address\", \"email\", \"birthdate\", \"work_history\", \"education\", and \"skills\". The \"work_history\" should be an array of objects, each with the attributes: \"job_title\", \"company\", \"description\", \"start_date\", and \"end_date\". The \"description\" should provide a concise, high-level summary of the job, no more than two sentences. Dates should be formatted in MM/YYYY. If a job is currently ongoing, please use \"current\" for the \"end_date\". For the \"education\", it should be an array of objects, each with the attributes: \"school_name\", \"school_type\", \"degree_type\", \"degree_major\", \"grade\", \"start_date\", and \"end_date\". For \"school_type\", acceptable values include, but are not limited to 'high school', 'college', 'junior college', 'university', etc. For \"degree_type\", only include the level and general type of the degree such as 'Associate of Arts', 'Bachelor of Science', 'Masters', 'M.S.', 'B.A.', 'Ph.D.', etc. without specifying the major or field of study. For \"degree_major\", list the specific field of study or major such as 'Physics', 'Engineering', 'Criminal Justice', 'Law', etc. independently. The \"grade\" should represent the score or value received, followed by the grading system, for example, '3.8 GPA' or '85 Percentage'. The \"skills\" should be an array of relevant skills based on the skills, experience, knowledge, and abilities of the person in the resume. These skills should be relevant to the kind of job the person would be looking for and should be three or less words long. Dates for the \"birthdate\" should be formatted in MM/DD/YYYY, while other dates should be formatted in MM/YYYY. If no birthdate is provided, return an empty string. If the person is currently enrolled, please use \"current\" for the \"end_date\". Expected response format, please ONLY provide the following JSON object: { \"first_name\": \"First Name\", \"last_name\": \"Last Name\", \"phone_number\": \"Phone Number\", \"address\": \"Address\", \"email\": \"Email\", \"birthdate\": \"MM/DD/YYYY\", \"work_history\": [ { \"job_title\": \"Job Title\", \"company\": \"Company\", \"description\": \"Concise high-level job summary\", \"start_date\": \"MM/YYYY\", \"end_date\": \"MM/YYYY or current\" }, ... ], \"education\": [ { \"school_name\": \"School Name\", \"school_type\": \"high school/college/junior college/university\", \"degree_type\": \"Associate of Arts/Bachelor of Science/Masters/M.S./B.A./Ph.D.\", \"degree_major\": \"Physics/Engineering/Criminal Justice/Law\", \"grade\": \"3.8 GPA/85 Percentage\", \"start_date\": \"MM/YYYY\", \"end_date\": \"MM/YYYY or current\" }, ... ], \"skills\": [\"Skill1\", \"Skill2\", ...] } The resume is as follows:\n"

    response = client.chat(
      parameters: {
        model: 'gpt-3.5-turbo-16k',
        messages: [{ role: 'user', content: "#{openai_prompt}#{resume_string}" }],
        temperature: 0
      }
    )
    info = JSON.parse(response.dig('choices', 0, 'message', 'content'))
    info_with_dates(info)
  rescue JSON::ParserError, TypeError => e
    puts "Not valid JSON: #{e.inspect}"
  end

  def info_with_dates(info)
    if info['work_history'].is_a?(Array)
      info['work_history'].each_with_index do |experience, index|
        start_date = info_date(experience['start_date'])
        info['work_history'][index]['start_date'] = start_date if start_date
        end_date = info_date(experience['end_date'])
        info['work_history'][index]['end_date'] = end_date if end_date
      end
    end

    return info unless info['education'].is_a?(Array)

    info['education'].each_with_index do |education, index|
      info['education'][index]['start_date'] = info_date(education['start_date'])
      info['education'][index]['end_date'] = info_date(education['end_date'])
    end

    info
  end

  def info_date(date)
    return nil if %w[N/A current].include?(date) || date.blank?

    split_date = date.split('/').map(&:to_i)
    return nil unless split_date.size == 2

    Date.new(split_date[1], split_date[0])
  end

  def parse
    uri = URI.parse(API_URL)
    String body = {
      url: @resume_url,
      userkey: USER_KEY,
      version: VERSION,
      subuserid: USER_ID
    }
    headers = {
      'Content-Type' => 'application/json',
      'Accept' => 'application/json'
    }
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    response = http.post(uri.path, body.to_json, headers)
  end

  def sovren_parse
    account_id = ENV['sovren_client_id']
    service_key = ENV['sovren_service_key']
    uri = URI.parse('https://rest.resumeparsing.com/v9/parser/resume')
    request = Net::HTTP::Post.new(uri)
    request.content_type = 'application/json'
    request['Accept'] = 'application/json'
    request['Sovren-Accountid'] = account_id
    request['Sovren-Servicekey'] = service_key
    request.body = {
      "DocumentAsBase64String": Base64.encode64(open(@resume_url).read)
    }.to_json
    req_options = {
      use_ssl: uri.scheme == 'https'
    }
    response = Net::HTTP.start(uri.hostname, uri.port, req_options) do |http|
      http.request(request)
    end
  end
end
