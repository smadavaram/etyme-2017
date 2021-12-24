# frozen_string_literal: true

# == Schema Information
#
# Table name: attachments
#
#  id              :integer          not null, primary key
#  file            :string
#  file_name       :string
#  file_size       :integer
#  file_type       :string
#  attachable_type :string
#  attachable_id   :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  company_id      :integer
#
class Attachment < ApplicationRecord
  belongs_to :attachable, polymorphic: true, optional: true
  belongs_to :company, optional: true

  validates :file, presence: { message: ' cannot be blank.' }

  # self.per_page = 10
  # validate :file_size_validation
  #
  # mount_uploader :file, TaskAttachmentUploader
  #
  # def file_size_validation
  #   errors[:file] << "should be less than 2 MB" if file.size > 2.megabytes
  # end
end
