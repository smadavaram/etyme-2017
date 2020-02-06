# frozen_string_literal: true

class Plugin < ApplicationRecord
  enum plugin_type: %i[docusign zoom skype]
  belongs_to :company
end
