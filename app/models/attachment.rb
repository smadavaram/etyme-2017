class Attachment < ActiveRecord::Base

  belongs_to :attachable, polymorphic: true

  validates :file, presence: {message: ' cannot be empty.'}
  # validate :file_size_validation
  #
  # mount_uploader :file, TaskAttachmentUploader
  #
  # def file_size_validation
  #   errors[:file] << "should be less than 2 MB" if file.size > 2.megabytes
  # end
end
