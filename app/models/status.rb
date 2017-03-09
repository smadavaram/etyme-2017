class Status < ActiveRecord::Base
  belongs_to :statusable ,polymorphic: :true
  belongs_to :user
  alias_attribute :created_by, :user
  enum status_type: [:pending ,:active]
end