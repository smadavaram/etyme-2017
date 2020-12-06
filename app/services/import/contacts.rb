# frozen_string_literal: true

module Import
  class Contacts < Base

    attr_reader :contacts

    def initialize(contacts)
      @contacts = contacts || {}
    end

    def call
      contacts.find_each do |contact|

      end
    end

  end
end