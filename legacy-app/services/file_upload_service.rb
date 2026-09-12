# frozen_string_literal: true

class FileUploadService
  def initialize
    @client = Aws::S3::Client.new(
      access_key_id: ENV['DO_ACCESS_KEY_ID'],
      secret_access_key: ENV['DO_SECRET_ACCESS_KEY'],
      endpoint: "https://#{ENV['DO_REGION']}.digitaloceanspaces.com",
      region: ENV['DO_REGION']
    )
  end

  def upload_to_s3(file, file_name)
    file_name_slug = SecureRandom.hex(10)
    @client.put_object(
      body: file,
      bucket: ENV['DO_BUCKET'],
      key: file_name_slug + file_name,
      acl: 'public-read'
    )
    { success: true, url: "https://#{ENV['DO_BUCKET']}.#{ENV['DO_REGION']}.digitaloceanspaces.com/#{file_name_slug + file_name}" }
  rescue Aws::S3::Errors::ServiceError => e
    { success: false, error: e.message }
  end
end
