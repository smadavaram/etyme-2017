module QuerySelector

  extend ActiveSupport::Concern

  class_methods do

    def find_like(attribute, value)
      where("#{attribute} LIKE ?", "%#{value}%")
    end

  end

end
