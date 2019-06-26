class Docusign < ApplicationRecord
 # has_many :integrations, as: :plugin
  belongs_to :company
end