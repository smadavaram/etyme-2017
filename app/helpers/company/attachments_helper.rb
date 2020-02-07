# frozen_string_literal: true

module Company::AttachmentsHelper
  def image_type(attachable)
    type = attachable.file_type
    if %w[image/jpeg image/png].include?(type)
      attachable.file
    elsif type == 'text/plain'
      'text_image.jpg'
    elsif type == 'application/pdf'
      'Acrobat-icon.png'
    end
  end
end
