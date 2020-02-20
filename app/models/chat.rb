# frozen_string_literal: true

class Chat < ApplicationRecord
  has_many   :messages, dependent: :destroy
  has_many   :chat_users, dependent: :destroy
  belongs_to :chatable, polymorphic: :true
  belongs_to :company, optional: true

  attr_accessor :user_ids

  def channel_name
    'message-' + id.to_s
  end

  def chat_user?(user)
    chat_users.find_by(userable: user).present?
  end

  # validates :chat_id ,uniqueness: {scope: [:chatable_id, :chatable_type] }
end
