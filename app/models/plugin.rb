class Plugin < ApplicationRecord
  enum plugin_type: [:docusign,:zoom]
  belongs_to :company
  validates_presence_of :access_token
  validates_presence_of :refresh_token
  validates_presence_of :account_id
end