# frozen_string_literal: true

class Status < ApplicationRecord
  belongs_to :statusable, polymorphic: :true
  belongs_to :user, optional: true
  validates :status_type, presence: :true
  validates :note, presence: :true
  alias_attribute :created_by, :user
  enum status_type: %i[Follow_Up Callback Not_responding Active Archived]
end
