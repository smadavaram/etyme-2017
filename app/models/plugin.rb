class Plugin < ApplicationRecord
  enum plugin_type: [:docusign,:zoom, :skype]
  belongs_to :company
end