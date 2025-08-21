jQuery ->
  new CandidateStatus

class CandidateStatus
  constructor: ->
    $("[name='candidate-status-toggle']").bootstrapSwitch()
    $('input[name="candidate-status-toggle"]').on('switchChange.bootstrapSwitch', @updateAttorneyStatus)

  updateAttorneyStatus: (event) ->
    status_link = $(".status-change")
    $.get "/candidate/candidates/status_update.json", (data) ->
      status_link.text(data.chat_status)
    event.preventDefault()