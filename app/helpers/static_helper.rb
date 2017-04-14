module StaticHelper
  def resource_name
    :candidate
  end

  def resource
    @resource ||= Candidate.new
  end

  def resource_class
    Candidate
  end
  def flash_class(level)
    case level
      when :notice then "alert alert-info"
      when :success then "alert alert-success"
      when :error then "alert alert-error"
      when :alert then "alert alert-error"
      when :errors then "alert alert-error"
    end
  end

end
