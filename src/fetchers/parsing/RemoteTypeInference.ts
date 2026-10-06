import { RemoteType } from "../../models/Job";

// Location and tags decide remote type. The description is ignored so a remote role that mentions an office is not marked onsite.
export class RemoteTypeInference {
  public infer(locationText: string, tags: string[], defaultType: RemoteType): RemoteType {
    let combined: string = locationText.toLowerCase();
    for (let index: number = 0; index < tags.length; index++) {
      combined = combined + " " + tags[index].toLowerCase();
    }
    if (combined.indexOf("hybrid") >= 0) {
      return "hybrid";
    }
    const saysOnsite: boolean = combined.indexOf("onsite") >= 0
      || combined.indexOf("on-site") >= 0
      || combined.indexOf("on site") >= 0
      || combined.indexOf("in office") >= 0
      || combined.indexOf("in-office") >= 0;
    const saysRemote: boolean = combined.indexOf("remote") >= 0
      || combined.indexOf("work from home") >= 0
      || combined.indexOf("anywhere") >= 0;
    if (saysOnsite && !saysRemote) {
      return "onsite";
    }
    if (saysRemote) {
      return "remote";
    }
    return defaultType;
  }
}
