# frozen_string_literal: true

module Import
  class Base

    def self.call(*args, &block)
      new(*args, &block).call
    end

  end
end