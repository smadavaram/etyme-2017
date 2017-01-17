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
end
